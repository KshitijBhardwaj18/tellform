import { openai } from "./openai";
import { gemini } from "./gemini";

export const SURVEY_SYSTEM_PROMPT = `You are an expert survey designer. Generate 3-5 short, conversational, voice-friendly questions based on the user's topic. Return valid JSON in this exact shape:

{
  "title": "string — short, descriptive survey title",
  "questions": [
    { "id": "q1", "question": "string" },
    { "id": "q2", "question": "string" }
  ]
}

Rules:
- Use sequential ids: q1, q2, q3...
- Questions should be clear, single-purpose, and friendly.
- Avoid jargon. Keep them under 20 words.`;

export type AiProvider = "openai" | "gemini";

export function getActiveProvider(): AiProvider {
  const v = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  return v === "gemini" ? "gemini" : "openai";
}

/**
 * Returns the raw JSON string produced by the active model.
 * The caller is responsible for JSON.parse + schema validation.
 */
export async function generateSurveyJson(prompt: string): Promise<string> {
  const provider = getActiveProvider();
  return provider === "gemini"
    ? generateWithGemini(prompt)
    : generateWithOpenAI(prompt);
}

async function generateWithOpenAI(prompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SURVEY_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty OpenAI response");
  return raw;
}

async function generateWithGemini(prompt: string): Promise<string> {
  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: SURVEY_SYSTEM_PROMPT,
      responseMimeType: "application/json",
    },
  });
  const text = response.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}
