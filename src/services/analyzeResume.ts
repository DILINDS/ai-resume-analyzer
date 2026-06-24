export async function analyzeResume(text: string): Promise<string> {
  const prompt = `
Analyze this resume and provide:

1. ATS Score out of 100
2. Skills found
3. Missing skills
4. Strengths
5. Weaknesses
6. Career suggestions

Resume:
${text}
`;

  return prompt;
}