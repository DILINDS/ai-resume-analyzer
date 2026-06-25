const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;

// Models from DIFFERENT providers so they don't all fail together.
// Llama models (Venice provider) are put last since Venice rate-limits heavily.
const FREE_MODELS = [
  "google/gemma-4-31b-it:free",                // Google provider
  "nvidia/nemotron-3-ultra-550b-a55b:free",     // NVIDIA provider
  "nousresearch/hermes-3-llama-3.1-405b:free",  // NousResearch provider
  "meta-llama/llama-3.3-70b-instruct:free",     // Venice (last resort)
  "meta-llama/llama-3.2-3b-instruct:free",      // Venice (last resort)
];

class SkipModelError extends Error {}

async function callOpenRouter(model: string, prompt: string): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Resume Analyzer",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const body = await response.text();

  if (response.status === 429 || response.status === 404) {
    // Skip immediately — don't wait, just try the next model
    console.warn(`⏭ Skipping ${model} (${response.status})`);
    throw new SkipModelError(`${model} skipped`);
  }

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${body}`);
  }

  const data = JSON.parse(body);
  const result = data.choices?.[0]?.message?.content;

  if (!result) {
    throw new Error("No response received from the AI model.");
  }

  return result;
}

export async function analyzeResume(text: string, modelRef?: { used: string }): Promise<string> {
  if (!apiKey) {
    throw new Error("OpenRouter API key is missing. Check your .env file.");
  }

  const prompt = `You are an expert resume reviewer and ATS (Applicant Tracking System) specialist.

Analyze the following resume and provide a detailed structured report. Use EXACTLY this format with these numbered headings:

1. **ATS Score** – Give a score out of 100 and briefly explain why.
2. **Skills Found** – List technical and soft skills as bullet points (- item).
3. **Missing Key Skills** – List missing skills as bullet points (- item).
4. **Strengths** – List strengths as bullet points (- item).
5. **Weaknesses** – List weaknesses as bullet points (- item).
6. **Career Suggestions** – List 3-5 suitable job roles as bullet points (- item). Do NOT use numbered sub-lists here.

Resume:
${text}`;

  console.log("[analyzeResume] Sending prompt, resume length:", text.length);

  for (const model of FREE_MODELS) {
    try {
      console.log(`Trying model: ${model}`);
      const result = await callOpenRouter(model, prompt);
      console.log(`✅ Success with: ${model}`);
      if (modelRef) modelRef.used = model;
      return result;
    } catch (err) {
      if (err instanceof SkipModelError) {
        console.warn(`Skipping to next model...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    "All free models are currently unavailable. Please wait a minute and try again."
  );
}
