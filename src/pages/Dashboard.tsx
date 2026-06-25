import { useState, useEffect } from "react";
import { fetchUserHistory, deleteAnalysis } from "../services/auth";
import type { AuthUser } from "../services/auth";

interface HistoryItem {
  id: string;
  resume_id: string | null;
  original_name: string | null;
  ats_score: number;
  skills_found: string[];
  missing_skills: string[];
  strengths: string[];
  weaknesses: string[];
  career_suggestions: string[];
  raw_text: string;
  model_used: string;
  created_at: string;
}

interface DashboardProps {
  user: AuthUser;
  onBack: () => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
  const bg = score >= 75 ? "rgba(52,211,153,0.12)" : score >= 50 ? "rgba(251,191,36,0.12)" : "rgba(248,113,113,0.12)";
  const border = score >= 75 ? "rgba(52,211,153,0.25)" : score >= 50 ? "rgba(251,191,36,0.25)" : "rgba(248,113,113,0.25)";
  return (
    <div
      className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl shrink-0"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <span className="text-xl font-black" style={{ color }}>{score}</span>
      <span className="text-xs font-medium" style={{ color, opacity: 0.7 }}>/ 100</span>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatBytes(bytes: number) {
  if (!bytes) return "";
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

export default function Dashboard({ user, onBack }: DashboardProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchUserHistory(user.id)
      .then((data) => setHistory(data as HistoryItem[]))
      .catch((err) => {
        // If table doesn't exist yet, just show empty state instead of error
        const msg = String(err);
        if (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("42P01")) {
          console.warn("analyses table not found — run SQL migrations in Supabase");
          setHistory([]);
        } else {
          setError("Failed to load history: " + msg);
        }
      })
      .finally(() => setLoading(false));
  }, [user.id]);

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    setDeleting(id);
    try {
      await deleteAnalysis(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (err: any) {
      console.error("Delete failed:", err);
      setError("Delete failed: " + (err?.message ?? String(err)));
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (item: HistoryItem) => {
    const name = item.original_name ?? "Resume Analysis";
    const date = new Date(item.created_at).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
    const scoreColor = item.ats_score >= 75 ? "#059669" : item.ats_score >= 50 ? "#d97706" : "#dc2626";

    const makeSection = (title: string, emoji: string, items: string[], color: string) =>
      items?.length ? `
        <div class="section">
          <h3>${emoji} ${title}</h3>
          <div class="tags">${items.map((t) => `<span class="tag" style="border-color:${color}40;color:${color}">${t}</span>`).join("")}</div>
        </div>` : "";

    const html = `<!DOCTYPE html><html lang="en"><head>
      <meta charset="UTF-8"/>
      <title>Resume Analysis - ${name}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #fff; color: #1a1a2e; padding: 40px; max-width: 780px; margin: 0 auto; }
        h1 { font-size: 22px; font-weight: 800; color: #4f46e5; margin-bottom: 4px; }
        .meta { color: #666; font-size: 13px; margin-bottom: 28px; }
        .score-box { display: inline-flex; align-items: center; gap: 14px;
          background: #f5f3ff; border: 2px solid #c4b5fd; border-radius: 14px;
          padding: 14px 20px; margin-bottom: 28px; }
        .score-num { font-size: 42px; font-weight: 900; color: ${scoreColor}; line-height: 1; }
        .score-label strong { display: block; font-size: 15px; color: #333; }
        .score-label { font-size: 13px; color: #555; }
        .section { margin-bottom: 22px; }
        h3 { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 10px;
          padding-bottom: 6px; border-bottom: 1px solid #eee; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag { font-size: 12px; padding: 4px 10px; border-radius: 20px; border: 1px solid; font-weight: 500; }
        .footer { margin-top: 32px; font-size: 11px; color: #aaa; text-align: right; }
        @media print { body { padding: 20px; } }
      </style>
    </head><body>
      <h1>Resume Analysis Report</h1>
      <p class="meta">${name} &middot; ${date}${item.model_used ? " &middot; Model: " + item.model_used : ""}</p>
      <div class="score-box">
        <div class="score-num">${item.ats_score}</div>
        <div class="score-label"><strong>ATS Score</strong>out of 100</div>
      </div>
      ${makeSection("Skills Found", "&#x2705;", item.skills_found, "#059669")}
      ${makeSection("Missing Key Skills", "&#x26A0;&#xFE0F;", item.missing_skills, "#d97706")}
      ${makeSection("Strengths", "&#x1F4AA;", item.strengths, "#4f46e5")}
      ${makeSection("Weaknesses", "&#x1F527;", item.weaknesses, "#dc2626")}
      ${makeSection("Career Suggestions", "&#x1F680;", item.career_suggestions, "#0891b2")}
      <div class="footer">Generated by AI Resume Analyzer</div>
    </body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { win.print(); URL.revokeObjectURL(url); };
    }
  };


  return (
    <div className="min-h-screen bg-animated relative">
      <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />

      {/* Header */}
      <header className="relative z-10 border-b border-white/5 glass-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={onBack} className="btn-secondary py-2 px-4 rounded-xl text-sm flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <h1 className="font-bold text-white">My Resume History</h1>
          </div>
          <div className="ml-auto text-white/30 text-sm">{user.email}</div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <svg className="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <p className="text-white/40">Loading your history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <h2 className="text-white/80 font-semibold text-lg mb-2">No analyses yet</h2>
            <p className="text-white/40 text-sm">Go back and analyze your first resume to see it here.</p>
            <button onClick={onBack} className="btn-primary mt-6 py-2.5 px-6 rounded-xl text-sm inline-flex items-center gap-2">
              Analyze a Resume
            </button>
          </div>
        ) : (
          <div className={`gap-6 ${selected ? "flex flex-col lg:flex-row" : ""}`}>
            {/* Card grid */}
            <div className={`space-y-3 ${selected ? "lg:w-96 shrink-0" : "grid grid-cols-1 md:grid-cols-2 gap-4 space-y-0"}`}>
              {history.map((item, i) => (
                <div
                  key={item.id}
                  onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  className={`glass-card glass-card-hover rounded-2xl p-5 cursor-pointer fade-in-up transition-all
                    ${selected?.id === item.id ? "border-violet-500/40 bg-violet-500/8" : ""}`}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="flex items-start gap-4">
                    <ScoreBadge score={item.ats_score} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">
                        {item.original_name ?? "Resume Analysis"}
                      </p>
                      <p className="text-white/35 text-xs mt-0.5">{formatDate(item.created_at)}</p>

                      <div className="flex gap-2 mt-3 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-xs border border-emerald-500/20">
                          {item.skills_found?.length ?? 0} skills
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 text-xs border border-red-500/20">
                          {item.missing_skills?.length ?? 0} missing
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDownload(item)}
                        disabled={deleting === item.id}
                        title="Download Analysis Report as PDF"
                        className="p-2 rounded-lg bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-white/40 transition-all disabled:opacity-30"
                      >
                        {downloading === item.id ? (
                          <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        )}
                      </button>
                      {/* Delete button / inline confirm */}
                      {confirmDeleteId === item.id ? (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deleting === item.id}
                            className="px-2 py-1 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs font-semibold transition-all"
                          >
                            {deleting === item.id ? "…" : "Yes"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 text-xs transition-all"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          disabled={deleting === item.id}
                          title="Delete"
                          className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-white/40 transition-all"
                        >
                          {deleting === item.id ? (
                            <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          ) : (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="flex-1 glass-card rounded-2xl p-6 fade-in-up overflow-auto max-h-[80vh]">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-bold text-white text-lg truncate">{selected.original_name ?? "Resume Analysis"}</h2>
                  <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white/70 transition-colors p-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                <div className="space-y-5">
                  {/* Score */}
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/3 border border-white/6">
                    <ScoreBadge score={selected.ats_score} />
                    <div>
                      <p className="text-white/90 font-semibold">ATS Score</p>
                      <p className="text-white/40 text-sm">
                        {selected.ats_score >= 75 ? "Excellent — ATS ready" : selected.ats_score >= 50 ? "Good — some gaps" : "Needs improvement"}
                      </p>
                    </div>
                  </div>

                  {/* Sections */}
                  {[
                    { label: "✅ Skills Found", items: selected.skills_found, cls: "tag-found" },
                    { label: "⚠️ Missing Skills", items: selected.missing_skills, cls: "tag-missing" },
                    { label: "💪 Strengths", items: selected.strengths, cls: "tag-found" },
                    { label: "🔧 Weaknesses", items: selected.weaknesses, cls: "tag-missing" },
                    { label: "🚀 Career Suggestions", items: selected.career_suggestions, cls: "tag-suggestion" },
                  ].map(({ label, items, cls }) =>
                    items?.length ? (
                      <div key={label} className="section-card p-4">
                        <p className="text-sm font-semibold text-white/70 mb-3">{label}</p>
                        <div className="flex flex-wrap gap-1">
                          {items.map((t, i) => <span key={i} className={`tag-pill ${cls}`}>{t}</span>)}
                        </div>
                      </div>
                    ) : null
                  )}

                  {/* Model used */}
                  {selected.model_used && (
                    <p className="text-white/20 text-xs text-right">Analyzed by: {selected.model_used}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
