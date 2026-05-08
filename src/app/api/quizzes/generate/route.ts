import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateQuizJson, getActiveProvider } from "@/lib/ai";
import { getOwnedOrganization } from "@/lib/access";
import { searchSnippets, formatContext } from "@/lib/rag";

const Body = z.object({
  prompt: z.string().min(3).max(1000),
  questionCount: z.number().int().min(1).max(20),
  useKnowledgeBase: z.boolean().optional(),
});

const McqQuestion = z.object({
  id: z.string(),
  type: z.literal("mcq"),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctAnswer: z.string().min(1),
});

const OpenQuestion = z.object({
  id: z.string(),
  type: z.literal("open"),
  question: z.string().min(1),
  correctAnswer: z.string().min(1),
});

const GeneratedSchema = z.object({
  title: z.string().min(1),
  questions: z.array(z.discriminatedUnion("type", [McqQuestion, OpenQuestion])).min(1).max(20),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const org = await getOwnedOrganization(session.user.id);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });

  let context: string | undefined;
  if (parsed.data.useKnowledgeBase) {
    try {
      const hits = await searchSnippets(org.id, parsed.data.prompt, 6);
      context = hits.length > 0 ? formatContext(hits) : undefined;
    } catch {
      // ignore — fall through without context
    }
  }

  let raw: string;
  try {
    raw = await generateQuizJson(
      parsed.data.prompt,
      parsed.data.questionCount,
      context,
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `AI generation failed (${getActiveProvider()}): ${
          err instanceof Error ? err.message : "unknown"
        }`,
      },
      { status: 502 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid AI JSON" }, { status: 502 });
  }

  const generated = GeneratedSchema.safeParse(json);
  if (!generated.success) {
    return NextResponse.json({ error: "AI output failed schema" }, { status: 502 });
  }

  for (const q of generated.data.questions) {
    if (q.type === "mcq" && !q.options.includes(q.correctAnswer)) {
      return NextResponse.json(
        { error: "AI returned MCQ with correctAnswer not in options" },
        { status: 502 },
      );
    }
  }

  const quiz = await prisma.quiz.create({
    data: {
      title: generated.data.title,
      questions: generated.data.questions,
      organizationId: org.id,
    },
  });

  return NextResponse.json({ quizId: quiz.id, provider: getActiveProvider() });
}
