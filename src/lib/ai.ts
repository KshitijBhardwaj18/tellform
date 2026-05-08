import { openai } from "./openai";
import { gemini } from "./gemini";

export const CONTEXT_INSTRUCTION = `When a <context> section is provided, use it as ground truth about the subject. Prefer specifics from it (names, features, terminology, steps) when they help craft better questions.`;

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

export const QUIZ_SYSTEM_PROMPT = `You are an expert quiz designer. Generate a quiz on the user's topic. Mix multiple-choice and open-ended questions for variety. Return valid JSON in this exact shape:

{
  "title": "string — short, descriptive quiz title",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "string — the exact text of the correct option"
    },
    {
      "id": "q2",
      "type": "open",
      "question": "string",
      "correctAnswer": "string — the canonical correct answer (concise)"
    }
  ]
}

Rules:
- Use sequential ids: q1, q2, q3...
- Generate EXACTLY the number of questions the user requests.
- For "mcq": provide 3-4 plausible options. correctAnswer MUST exactly match one option string.
- For "open": correctAnswer is the model answer used for grading; keep it factual and concise.
- Mix mcq and open roughly half-and-half unless the topic clearly favors one.
- Voice-friendly: avoid code, formulas, or anything hard to read aloud.
- Keep questions under 25 words.`;

export const SCORE_SYSTEM_PROMPT = `You are a strict but fair quiz grader. You will receive a quiz definition and a respondent's answers (which may be voice-transcribed and contain transcription noise). Score each answer.

Return valid JSON in this exact shape:

{
  "items": [
    { "questionId": "q1", "score": 1, "rationale": "string — one short sentence" },
    { "questionId": "q2", "score": 0.5, "rationale": "string — one short sentence" }
  ],
  "total": 1.5,
  "max": 2
}

Rules:
- For mcq questions: score is 1 if the answer matches the correct option (semantically — accept close transcriptions or the option number), else 0.
- For open questions: score is between 0 and 1, with one decimal place. 1 = fully correct, 0.5 = partially correct, 0 = wrong/empty.
- Be lenient with transcription artifacts (typos, missing punctuation, "uh"/"um", number words like "two" vs "2").
- "max" is the count of questions. "total" is the sum of scores, rounded to one decimal.
- Always include every questionId from the quiz, in order.`;

export type AiProvider = "openai" | "gemini";

export function getActiveProvider(): AiProvider {
  const v = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  return v === "gemini" ? "gemini" : "openai";
}

/**
 * Returns the raw JSON string produced by the active model.
 * The caller is responsible for JSON.parse + schema validation.
 */
export async function generateSurveyJson(
  prompt: string,
  context?: string,
): Promise<string> {
  const system = context
    ? `${SURVEY_SYSTEM_PROMPT}\n\n${CONTEXT_INSTRUCTION}`
    : SURVEY_SYSTEM_PROMPT;
  const user = context
    ? `<context>\n${context}\n</context>\n\nTopic: ${prompt}`
    : prompt;
  return runJson(system, user);
}

export async function generateQuizJson(
  prompt: string,
  questionCount: number,
  context?: string,
): Promise<string> {
  const system = context
    ? `${QUIZ_SYSTEM_PROMPT}\n\n${CONTEXT_INSTRUCTION}`
    : QUIZ_SYSTEM_PROMPT;
  const user = context
    ? `<context>\n${context}\n</context>\n\nTopic: ${prompt}\n\nNumber of questions: ${questionCount}`
    : `Topic: ${prompt}\n\nNumber of questions: ${questionCount}`;
  return runJson(system, user);
}

export const DYNAMIC_CONFIG_SYSTEM_PROMPT = `You design configurations for AI-led adaptive interviews. Given a short topic the user wants to learn about, you produce a complete config: a sharp objective, 2–4 anchor questions, 3–6 checkpoint topics, a sensible budget, an optional persona, and 1–2 stop conditions.

Return valid JSON in this exact shape:

{
  "title": "string — short descriptive title for the survey",
  "objective": "string — the single goal that guides every question (1–2 sentences, crisp)",
  "anchors": [
    { "id": "a1", "question": "string" },
    { "id": "a2", "question": "string" }
  ],
  "checkpoints": [
    { "id": "c1", "description": "string — the topic that must be covered" }
  ],
  "budget": { "maxQuestions": 8, "maxFollowUpsPerAnchor": 2 },
  "stopConditions": ["string"],
  "persona": "string — short tone description"
}

Rules:
- 2–4 anchors. They are MUST-ASK questions in order; the AI fills in follow-ups around them.
- 3–6 checkpoints with stable snake_case ids (e.g. "root_cause", "competitor_mentioned").
- Budget: maxQuestions between 5 and 12; maxFollowUpsPerAnchor between 1 and 3.
- Anchors are conversational, single-purpose, under 20 words.
- Persona example: "warm, curious, concise".
- 1–2 plain-English stop conditions (e.g. "user gives one-word answers twice in a row").`;

export async function generateDynamicConfigJson(topic: string): Promise<string> {
  return runJson(DYNAMIC_CONFIG_SYSTEM_PROMPT, `Topic: ${topic}`);
}

export const INTERVIEWER_TURN_SYSTEM_PROMPT = `You are a thoughtful, attentive interviewer running ONE turn of a conversational survey. You receive a notebook of state, the prior turn's question and the respondent's answer, and you must do four things in a single JSON output:

1. Classify which checkpoints (if any) the answer covered.
2. Decide what to SAY back — a short, human acknowledgement that reflects the user's actual reply (empathy, gentle redirect, or a graceful offer to wrap up if they're hostile or disengaged).
3. Decide what to DO next — ask another question, or end the interview.
4. If asking, produce the next question.

Hard rules:
- Output exactly one JSON object, no prose, no markdown.
- The reply must NEVER be empty for a non-empty answer. Always acknowledge what the user said in 1 short sentence (max 12 words). Reflect what they said; don't praise.
- If the answer is hostile, dismissive, refusing, or off-topic ("fuck off", "I don't want to do this", silence twice in a row, "shut up"), respond with a calm, respectful acknowledgement and offer to end ("Understood — I'll stop here. Thanks for your time."). In that case set action="end" with reason="user disengaged".
- If they refuse just one question, redirect softly and ask a different angle. Don't end on a single refusal unless they explicitly ask to stop.
- Stay strictly on the objective. Use the notebook to prefer uncovered checkpoints and resume unresolved threads.
- Never repeat or rephrase a question already asked.
- Hard budget enforced by the harness; you can still recommend ending early.
- Persona: match the persona field's tone for both reply and question.
- Question (when action=ask): single-purpose, under 25 words, conversational.

Output JSON shape:
{
  "covered": [
    { "checkpointId": "string", "confidence": 0.0, "evidence": "string — short quote/paraphrase" }
  ],
  "unresolvedThreads": ["string — at most 3, each under 8 words"],
  "reply": "string — what to say back to the user (≤12 words, ≤1 sentence, may be empty only on the very first turn when there's no prior answer)",
  "action": "ask" | "end",
  "endReason": "string — empty unless action=end",
  "question": "string — empty unless action=ask",
  "topicTag": "string — empty unless action=ask",
  "whyGenerated": "string — one sentence explaining why this question now; empty unless action=ask"
}

confidence is 0.0–1.0. Only emit checkpoints with confidence >= 0.5.`;

export const RESPONSE_SUMMARY_SYSTEM_PROMPT = `You summarize a single respondent's interview transcript for the survey admin. Your output appears in the analytics dashboard, so be brief, specific, and decision-useful.

Output exactly one JSON object:
{
  "oneLine": "string — one-sentence headline of who this respondent was and what they said (max 25 words)",
  "completion": "completed" | "abandoned" | "refused",
  "engagement": "high" | "medium" | "low" | "hostile",
  "keyInsights": ["string — 2 to 5 bullets, each under 20 words, factual paraphrases of what the user said"],
  "notableQuotes": ["string — 0 to 3 short verbatim quotes worth surfacing"]
}

Rules:
- "completed" if they answered the planned questions through to a natural end. "abandoned" if they trailed off / went silent. "refused" if they explicitly told the bot to stop or were hostile.
- "hostile" engagement applies to swearing, dismissiveness, or active rejection.
- Insights should reflect WHAT they said, not whether the interview went well.
- Keep quotes verbatim from their answers; max ~15 words each.`;

export const GREETING_SYSTEM_PROMPT = `You write a warm, brief opening line for a survey interviewer to say before the first question. The line will be spoken aloud or shown on screen, then the first question follows immediately.

Hard rules:
- Output exactly one JSON object: { "greeting": "string" }.
- Single sentence. 12–25 words.
- Vary phrasing each time — do not start with "Hi" every time. Mix in "Hey", "Welcome", "Thanks for joining", "Glad you're here", a direct first name, etc.
- Address the respondent by their first name once.
- Mention what the survey is about in a natural, non-formal way (one phrase, drawn from the objective or title — do NOT quote them verbatim).
- Match the persona's tone.
- For voice mode: hint that they can just speak their answer.
- For text mode: hint that short answers are fine.
- No greetings like "Hello there!". Sound like a person, not a chatbot.
- Never include the first question itself. The harness appends it after.`;

export async function generateGreetingJson(userMessage: string): Promise<string> {
  return runJson(GREETING_SYSTEM_PROMPT, userMessage);
}

export async function generateInterviewerTurnJson(
  userMessage: string,
): Promise<string> {
  return runJson(INTERVIEWER_TURN_SYSTEM_PROMPT, userMessage);
}

export async function generateResponseSummaryJson(
  userMessage: string,
): Promise<string> {
  return runJson(RESPONSE_SUMMARY_SYSTEM_PROMPT, userMessage);
}

export async function scoreQuizJson(
  quiz: unknown,
  answers: unknown,
): Promise<string> {
  const userMessage = `Quiz:\n${JSON.stringify(quiz)}\n\nRespondent answers:\n${JSON.stringify(answers)}`;
  return runJson(SCORE_SYSTEM_PROMPT, userMessage);
}

async function runJson(systemPrompt: string, userMessage: string): Promise<string> {
  const provider = getActiveProvider();
  return provider === "gemini"
    ? generateWithGemini(systemPrompt, userMessage)
    : generateWithOpenAI(systemPrompt, userMessage);
}

async function generateWithOpenAI(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty OpenAI response");
  return raw;
}

async function generateWithGemini(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: userMessage,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      temperature: 0,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}
