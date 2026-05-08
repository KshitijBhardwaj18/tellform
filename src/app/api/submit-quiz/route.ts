import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { scoreQuizJson, getActiveProvider } from "@/lib/ai";

const Body = z.object({
  quizId: z.string().min(1),
  respondentName: z.string().min(1).max(200),
  respondentEmail: z.string().email().max(320),
  answers: z
    .array(z.object({ questionId: z.string(), answer: z.string() }))
    .min(1),
});

const ScoreItem = z.object({
  questionId: z.string(),
  score: z.number().min(0).max(1),
  rationale: z.string().optional(),
});

const ScoreSchema = z.object({
  items: z.array(ScoreItem).min(1),
  total: z.number().min(0),
  max: z.number().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: parsed.data.quizId },
    select: { id: true, questions: true },
  });
  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let raw: string;
  try {
    raw = await scoreQuizJson(quiz.questions, parsed.data.answers);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Scoring failed (${getActiveProvider()}): ${
          err instanceof Error ? err.message : "unknown"
        }`,
      },
      { status: 502 },
    );
  }

  let scoreJson: unknown;
  try {
    scoreJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid scoring JSON" }, { status: 502 });
  }

  const scored = ScoreSchema.safeParse(scoreJson);
  if (!scored.success) {
    return NextResponse.json({ error: "Scoring output failed schema" }, { status: 502 });
  }

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId: parsed.data.quizId,
      respondentName: parsed.data.respondentName,
      respondentEmail: parsed.data.respondentEmail,
      answers: parsed.data.answers,
      score: scored.data,
    },
  });

  return NextResponse.json({ id: attempt.id });
}
