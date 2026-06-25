import { supabase } from "./supabase";

export type AuthUser = {
  id: string;
  email: string;
};

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback: (user: AuthUser | null) => void) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      callback({ id: session.user.id, email: session.user.email ?? "" });
    } else {
      callback(null);
    }
  });
}

// ── Save resume file + analysis (used when storage upload succeeds) ──────────
export async function saveResumeAndAnalysis({
  userId,
  file,
  storagePath,
  analysis,
  modelUsed,
}: {
  userId: string;
  file: File;
  storagePath: string;
  analysis: {
    atsScore: number;
    skillsFound: string[];
    missingSkills: string[];
    strengths: string[];
    weaknesses: string[];
    careerSuggestions: string[];
    rawText: string;
  };
  modelUsed: string;
}) {
  // 1. Insert into resumes table
  const { data: resumeRow, error: resumeError } = await supabase
    .from("resumes")
    .insert([{
      user_id: userId,
      filename: storagePath,
      original_name: file.name,
      file_size: file.size,
      storage_path: storagePath,
    }])
    .select()
    .single();

  if (resumeError) throw new Error("Resume insert failed: " + resumeError.message);

  // 2. Insert analysis linked to the resume row
  const { error: analysisError } = await supabase.from("analyses").insert([{
    resume_id: resumeRow.id,
    user_id: userId,
    ats_score: analysis.atsScore,
    skills_found: analysis.skillsFound,
    missing_skills: analysis.missingSkills,
    strengths: analysis.strengths,
    weaknesses: analysis.weaknesses,
    career_suggestions: analysis.careerSuggestions,
    raw_text: analysis.rawText,
    model_used: modelUsed,
  }]);

  if (analysisError) throw new Error("Analysis insert failed: " + analysisError.message);
  return resumeRow.id;
}

// ── Fetch all analyses for a user (works even without linked resume rows) ────
export async function fetchUserHistory(userId: string) {
  const { data, error } = await supabase
    .from("analyses")
    .select(`
      id,
      resume_id,
      original_name,
      ats_score,
      skills_found,
      missing_skills,
      strengths,
      weaknesses,
      career_suggestions,
      raw_text,
      model_used,
      created_at
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Delete an analysis row ───────────────────────────────────────────────────
export async function deleteAnalysis(analysisId: string) {
  const { error } = await supabase
    .from("analyses")
    .delete()
    .eq("id", analysisId);

  if (error) throw new Error(error.message);
}


// ── Get a signed download URL for a stored resume PDF ────────────────────────
export async function getResumeDownloadUrl(storagePath: string) {
  const { data } = await supabase.storage
    .from("resumes")
    .createSignedUrl(storagePath, 60 * 60); // 1-hour expiry
  return data?.signedUrl ?? null;
}
