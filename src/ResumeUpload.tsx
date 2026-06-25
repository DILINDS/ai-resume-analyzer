import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./services/supabase";
import { extractTextFromPDF } from "./services/pdfExtractor";
import { analyzeResume } from "./services/analyzeResume";
import { saveResumeAndAnalysis } from "./services/auth";
import type { AuthUser } from "./services/auth";

// ─── Parse AI analysis text into structured sections ───────────────────────
interface AnalysisResult {
  atsScore: number;
  skillsFound: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
  careerSuggestions: string[];
  rawText: string;
}

function parseAnalysis(text: string): AnalysisResult {
  const result: AnalysisResult = {
    atsScore: 0,
    skillsFound: [],
    missingSkills: [],
    strengths: [],
    weaknesses: [],
    careerSuggestions: [],
    rawText: text,
  };

  // ── ATS Score ──────────────────────────────────────────────────
  const scoreMatch = text.match(/(\d{1,3})\s*(?:\/\s*100|out of 100)/i);
  if (scoreMatch) result.atsScore = Math.min(parseInt(scoreMatch[1]), 100);

  // ── Helpers ────────────────────────────────────────────────────

  // Strip common markdown formatting from a single line
  const cleanLine = (line: string): string =>
    line
      .replace(/\|/g, "")
      .replace(/^[-*•✓✗→]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/`(.*?)`/g, "$1")
      .replace(/:-+:?|-+:?/g, "")
      .trim();

  // Extract list items from a section body — handles bullets, numbers, and markdown tables
  const extractItems = (block: string): string[] => {
    const items: string[] = [];
    for (const line of block.split(/\n/)) {
      const raw = line.trim();
      if (!raw) continue;
      // Skip pure separator rows like |---|---|
      if (/^\|?[\s|:\-]+\|/.test(raw) && !/[a-zA-Z]{3,}/.test(raw)) continue;
      // Markdown table row — take first non-empty cell
      if (raw.startsWith("|") || raw.includes(" | ")) {
        const cells = raw.split("|")
          .map((c) => cleanLine(c))
          .filter((c) => c.length >= 3 && !/^[-:]+$/.test(c));
        if (cells[0]) items.push(cells[0]);
        continue;
      }
      // Regular line (bullet or numbered)
      const clean = cleanLine(raw);
      if (clean.length >= 3 && clean.length <= 160 && !/^#+\s/.test(clean)) {
        items.push(clean);
      }
    }
    return items;
  };

  /**
   * Find a section body by looking for a heading line containing any of the
   * keywords, then capturing ALL text up to the NEXT top-level heading
   * (a line that starts the pattern "N. " or "## ").
   *
   * This is more reliable than split() because it never confuses numbered
   * sub-items inside a section with top-level section headings.
   */
  const findSection = (...keywords: string[]): string | null => {
    const kwPattern = keywords.join("|");
    // Match a heading line that contains a keyword, then capture until next heading
    const re = new RegExp(
      // heading line: optional leading number+dot, optional **bold**, keyword present
      `(?:^|\\n)[\\s\\d.)*#]*(?:\\*{0,2})?(?:${kwPattern})(?:\\*{0,2})?[^\\n]*\\n` +
      // body: everything until next top-level heading or end of string
      `((?:(?!(?:^|\\n)[\\d]+[.)][\\s]|(?:^|\\n)#{1,3}\\s)[\\s\\S])*?)` +
      `(?=\\n\\s*\\d+[.)]\\s|\\n#{1,3}\\s|$)`,
      "i"
    );
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };

  // Simpler greedy version: find everything between this heading and the next
  const findSectionGreedy = (...keywords: string[]): string | null => {
    const kwPattern = keywords.join("|");
    // Find the heading line
    const headingRe = new RegExp(`(?:^|\\n)([^\\n]*(?:${kwPattern})[^\\n]*)`, "i");
    const hm = text.match(headingRe);
    if (!hm) return null;

    const startIdx = (text.indexOf(hm[0]) + hm[0].length);
    const rest = text.slice(startIdx);

    // Find the next top-level numbered heading (e.g. "\n2. " or "\n## ")
    const nextHeadingRe = /\n\s*(?:\d+[.)]\s|#{1,3}\s)/;
    const nm = rest.match(nextHeadingRe);
    return nm ? rest.slice(0, nm.index).trim() : rest.trim();
  };

  // Inline fallback: "Label: item1, item2"
  const extractInline = (keyword: string): string[] => {
    const re = new RegExp(`${keyword}[^:\n]*:\\s*([^\n]+)`, "i");
    const m = text.match(re);
    if (!m) return [];
    return m[1].split(/[,;]/).map((s) => cleanLine(s)).filter((s) => s.length > 3);
  };

  // ── Skills Found ──────────────────────────────────────────────
  const skillsBlock = findSectionGreedy("Skills Found", "Technical Skills", "Skills Identified", "Existing Skills");
  result.skillsFound = skillsBlock ? extractItems(skillsBlock) : extractInline("Skills Found");

  // ── Missing Skills ────────────────────────────────────────────
  const missingBlock = findSectionGreedy("Missing Key Skills", "Missing Skills", "Skills to Add", "Recommended Skills", "Gap");
  result.missingSkills = missingBlock ? extractItems(missingBlock) : extractInline("Missing");

  // ── Strengths ─────────────────────────────────────────────────
  const strengthsBlock = findSectionGreedy("Strengths", "Strength");
  result.strengths = strengthsBlock ? extractItems(strengthsBlock) : extractInline("Strength");

  // ── Weaknesses ────────────────────────────────────────────────
  const weaknessesBlock = findSectionGreedy("Weaknesses", "Areas for Improvement", "Weakness", "Limitations");
  result.weaknesses = weaknessesBlock ? extractItems(weaknessesBlock) : extractInline("Weakness");

  // ── Career Suggestions ────────────────────────────────────────
  const careerBlock = findSectionGreedy(
    "Career Suggestions", "Career Paths", "Career Recommendation",
    "Recommended Roles", "Job Roles", "Recommended Positions", "Career Opportunities"
  );

  console.log("[parser] careerBlock raw:", careerBlock); // debug

  if (careerBlock) {
    const items = extractItems(careerBlock);
    if (items.length > 0) {
      result.careerSuggestions = items;
    } else {
      // Prose fallback: grab Title Case phrases
      const roleMatches = careerBlock.match(/[A-Z][a-zA-Z /&-]{3,50}/g) ?? [];
      result.careerSuggestions = [...new Set(roleMatches)].slice(0, 10);
    }
  } else {
    result.careerSuggestions = extractInline("Career");
  }

  // ── Deduplicate + filter empty ────────────────────────────────
  const dedup = (arr: string[]) => [...new Set(arr.filter((s) => s.length > 2))];
  result.skillsFound       = dedup(result.skillsFound);
  result.missingSkills     = dedup(result.missingSkills);
  result.strengths         = dedup(result.strengths);
  result.weaknesses        = dedup(result.weaknesses);
  result.careerSuggestions = dedup(result.careerSuggestions);

  console.log("[parser] result:", {
    atsScore: result.atsScore,
    skillsFound: result.skillsFound.length,
    missingSkills: result.missingSkills.length,
    strengths: result.strengths.length,
    weaknesses: result.weaknesses.length,
    careerSuggestions: result.careerSuggestions,
  });

  return result;
}



// ─── Animated Score Ring ────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const color = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
  const [animatedOffset, setAnimatedOffset] = useState(circumference);

  useEffect(() => {
    const offset = circumference - (score / 100) * circumference;
    const t = setTimeout(() => setAnimatedOffset(offset), 100);
    return () => clearTimeout(t);
  }, [score, circumference]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width="180" height="180" viewBox="0 0 180 180" className="drop-shadow-lg">
          <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
          <circle
            cx="90" cy="90" r={radius} fill="none" stroke={color} strokeWidth="12"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={animatedOffset}
            transform="rotate(-90 90 90)"
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)" }}
          />
          <text x="90" y="85" textAnchor="middle" fontSize="36" fontWeight="800" fill={color}>{score}</text>
          <text x="90" y="108" textAnchor="middle" fontSize="12" fill="rgba(255,255,255,0.4)" fontWeight="500">/ 100</text>
        </svg>
        <div className="absolute inset-0 rounded-full opacity-20 blur-2xl" style={{ background: color }} />
      </div>
      <span className="text-sm font-semibold" style={{ color }}>
        {score >= 75 ? "Excellent" : score >= 50 ? "Good" : "Needs Work"}
      </span>
    </div>
  );
}

// ─── Section Card ───────────────────────────────────────────────────────────
function Section({ title, icon, items, tagClass, delay }: {
  title: string; icon: string; items: string[]; tagClass: string; delay: number;
}) {
  if (!items.length) return null;
  return (
    <div className="section-card p-5 fade-in-up" style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{icon}</span>
        <h3 className="font-semibold text-white/90 text-sm">{title}</h3>
        <span className="ml-auto text-xs text-white/30 font-medium">{items.length} items</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => <span key={i} className={`tag-pill ${tagClass}`}>{item}</span>)}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function ResumeAnalyzer({ user }: { user: AuthUser | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [savedToHistory, setSavedToHistory] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState("");
  const [lastModelUsed, setLastModelUsed] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    setFile(f);
    setAnalysisResult(null);
    setSavedToHistory(false);
    setError(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  // Auto-save to Supabase — storage is optional, analysis DB save is the priority
  const saveToHistory = async (parsed: AnalysisResult, modelUsed: string, f: File) => {
    if (!user) return;
    setSaveError(false);

    // Step 1: Try to upload file to storage (optional — failure won't block save)
    let storagePath = "";
    try {
      const path = `${user.id}/${Date.now()}-${f.name.replace(/\s+/g, "-")}`;
      const { error: storageErr } = await supabase.storage
        .from("resumes")
        .upload(path, f);
      if (!storageErr) storagePath = path;
      else console.warn("Storage upload skipped:", storageErr.message);
    } catch (e) {
      console.warn("Storage upload exception (continuing):", e);
    }

    // Step 2: Save analysis directly to the analyses table (primary goal)
    try {
      const { error: analysisErr } = await supabase.from("analyses").insert([{
        user_id: user.id,
        original_name: f.name,
        ats_score: parsed.atsScore,
        skills_found: parsed.skillsFound,
        missing_skills: parsed.missingSkills,
        strengths: parsed.strengths,
        weaknesses: parsed.weaknesses,
        career_suggestions: parsed.careerSuggestions,
        raw_text: parsed.rawText,
        model_used: modelUsed,
      }]);

      if (analysisErr) {
        console.error("analyses insert error:", analysisErr);
        setSaveError(true);
        return;
      }

      // Step 3: Optionally save resume file metadata
      if (storagePath) {
        const { error: resumeErr } = await supabase.from("resumes").insert([{
          user_id: user.id,
          filename: storagePath,
          original_name: f.name,
          file_size: f.size,
          storage_path: storagePath,
        }]);
        if (resumeErr) console.warn("resumes table insert skipped:", resumeErr.message);
      }

      setSavedToHistory(true);
    } catch (err: any) {
      console.error("saveToHistory error:", err?.message ?? err);
      setSaveError(true);
    }
  };


  const analyzePDF = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setSavedToHistory(false);
    setError(null);
    setCurrentModel("Extracting text...");

    try {
      const text = await extractTextFromPDF(file);
      if (!text.trim()) throw new Error("Could not extract text. Is this a scanned image PDF?");

      setCurrentModel("Connecting to AI...");
      const modelRef = { used: "" };
      const aiText = await analyzeResume(text, modelRef);
      setLastModelUsed(modelRef.used);

      const parsed = parseAnalysis(aiText);
      setAnalysisResult(parsed);

      // Save to history AFTER showing results — errors here never affect the user
      if (user && file) {
        setCurrentModel("Saving to history...");
        // Fire and forget — don't await inside the main try/catch
        saveToHistory(parsed, modelRef.used, file).catch((e) =>
          console.warn("saveToHistory outer catch:", e)
        );
      }
    } catch (err) {
      setError(String(err).replace("Error: ", ""));
    } finally {
      setIsAnalyzing(false);
      setCurrentModel("");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Upload card ── */}
      <div className="glass-card rounded-2xl p-8">
        <div className="max-w-2xl mx-auto">
          {/* Drop zone */}
          <div
            className={`drop-zone rounded-2xl p-12 text-center cursor-pointer select-none
              ${isDragOver ? "drag-over" : ""} ${file ? "file-selected" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef} type="file" accept=".pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {file ? (
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-emerald-400 font-semibold text-lg">{file.name}</p>
                <p className="text-white/40 text-sm">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div>
                  <p className="text-white/80 font-semibold text-lg">Drop your resume here</p>
                  <p className="text-white/40 text-sm mt-1">or click to browse · PDF only</p>
                </div>
              </div>
            )}
          </div>

          {/* Analyze button */}
          <div className="mt-6">
            <button
              onClick={analyzePDF}
              disabled={!file || isAnalyzing}
              className="btn-primary w-full py-3.5 px-6 rounded-xl text-sm flex items-center justify-center gap-2.5"
            >
              {isAnalyzing ? (
                <>
                  <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  {currentModel || "Analyzing..."}
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Analyze Resume
                </>
              )}
            </button>
          </div>

          {/* Guest prompt */}
          {!user && file && !isAnalyzing && (
            <p className="text-center text-white/30 text-xs mt-3">
              Results won't be saved.{" "}
              <span className="text-violet-400">Sign in</span> to keep your history.
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <p className="text-red-400 text-sm leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Loading state ── */}
      {isAnalyzing && (
        <div className="glass-card rounded-2xl p-10 text-center pulse-glow">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <svg className="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p className="text-white/80 font-semibold text-lg">Analyzing your resume...</p>
          <p className="text-white/40 text-sm mt-2">{currentModel || "Connecting to AI models"}</p>
          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
            {["google/gemma", "nvidia/nemotron", "llama-3.3-70b"].map((m) => (
              <span key={m} className="px-2.5 py-1 rounded-full text-xs bg-white/5 text-white/30 border border-white/8">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {analysisResult && !isAnalyzing && (
        <div className="space-y-5 fade-in-up">

          {/* Saved to history banner */}
          {savedToHistory && (
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 fade-in-up">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-emerald-400 text-sm font-medium">
                Saved to your history! View it anytime from <strong>My History</strong>.
              </p>
            </div>
          )}

          {/* Save failed warning (non-blocking) */}
          {saveError && !savedToHistory && user && (
            <div className="flex items-start gap-3 px-5 py-3.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 fade-in-up">
              <svg className="mt-0.5 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <p className="text-yellow-400 text-sm">
                Analysis complete! <span className="opacity-70">Couldn't save to history — the database table may not be set up yet. Run the SQL migrations in your Supabase dashboard.</span>
              </p>
            </div>
          )}


          {/* Score + summary */}
          <div className="glass-card rounded-2xl p-8">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <ScoreRing score={analysisResult.atsScore} />
              <div className="flex-1 space-y-3 text-center md:text-left">
                <h2 className="text-2xl font-bold text-white">Resume Analysis Complete</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                  AI-powered breakdown of your resume. Use these insights to improve your ATS compatibility and stand out to recruiters.
                </p>
                {lastModelUsed && (
                  <p className="text-white/25 text-xs">Analyzed by: {lastModelUsed}</p>
                )}
                <div className="flex flex-wrap gap-3 justify-center md:justify-start mt-4">
                  {[
                    { label: "Skills Found", value: analysisResult.skillsFound.length, color: "emerald" },
                    { label: "Missing Skills", value: analysisResult.missingSkills.length, color: "red" },
                    { label: "Career Paths", value: analysisResult.careerSuggestions.length, color: "yellow" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className={`px-4 py-2.5 rounded-xl bg-${color}-500/10 border border-${color}-500/20`}>
                      <div className={`text-xl font-bold text-${color}-400`}>{value}</div>
                      <div className={`text-xs text-${color}-400/70`}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Sections grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Skills Found" icon="✅" items={analysisResult.skillsFound} tagClass="tag-found" delay={0.1} />
            <Section title="Missing Key Skills" icon="⚠️" items={analysisResult.missingSkills} tagClass="tag-missing" delay={0.2} />
            <Section title="Strengths" icon="💪" items={analysisResult.strengths} tagClass="tag-found" delay={0.3} />
            <Section title="Weaknesses" icon="🔧" items={analysisResult.weaknesses} tagClass="tag-missing" delay={0.4} />
          </div>

          {/* Career suggestions */}
          {analysisResult.careerSuggestions.length > 0 && (
            <div className="section-card p-5 fade-in-up" style={{ animationDelay: "0.5s" }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">🚀</span>
                <h3 className="font-semibold text-white/90 text-sm">Career Suggestions</h3>
              </div>
              <div className="flex flex-wrap gap-1">
                {analysisResult.careerSuggestions.map((item, i) => (
                  <span key={i} className="tag-pill tag-suggestion">{item}</span>
                ))}
              </div>
            </div>
          )}

          {/* Full raw analysis */}
          <details className="section-card p-5 cursor-pointer fade-in-up" style={{ animationDelay: "0.6s" }}>
            <summary className="flex items-center gap-2 text-sm font-medium text-white/50 select-none list-none hover:text-white/70 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              View Full AI Analysis
            </summary>
            <div className="mt-4 p-4 rounded-xl bg-black/30 border border-white/5">
              <pre className="text-white/60 text-xs leading-relaxed whitespace-pre-wrap font-mono overflow-auto max-h-96">
                {analysisResult.rawText}
              </pre>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
