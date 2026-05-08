import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateResponseSummaryJson, getActiveProvider } from "@/lib/ai";

const SummarySchema = z.object({
  oneLine: z.string().min(1).max(400),
  completion: z.enum(["completed", "abandoned", "refused"]),
  engagement: z.enum(["high", "medium", "low", "hostile"]),
  keyInsights: z.array(z.string().max(200)).max(8).default([]),
  notableQuotes: z.array(z.string().max(200)).max(5).default([]),
});

type Turn = {
  question: string;
  answer: string;
  source?: string;
  topicTag?: string;
  reply?: string;
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ responseId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { responseId } = await params;
  const response = await prisma.response.findFirst({
    where: {
      id: responseId,
      survey: { organization: { ownerId: session.user.id } },
    },
    select: {
      id: true,
      respondentName: true,
      transcript: true,
      answers: true,
      completedAt: true,
      state: true,
      survey: {
        select: { title: true, kind: true, objective: true },
      },
    },
  });

  if (!response) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const transcript = (response.transcript as unknown as Turn[] | null) ?? [];
  const answeredOnly = transcript.filter(
    (t) => t.answer && t.answer.trim().length > 0,
  );

  const stopReason =
    (response.state as { stopReason?: string } | null)?.stopReason ?? null;

  const userMessage = JSON.stringify(
    {
      surveyTitle: response.survey.title,
      surveyKind: response.survey.kind,
      objective: response.survey.objective,
      respondent: response.respondentName,
      completed: !!response.completedAt,
      stopReason,
      transcript: answeredOnly.map((t) => ({
        question: t.question,
        answer: t.answer,
      })),
    },
    null,
    2,
  );

  let raw: string;
  try {
    raw = await generateResponseSummaryJson(userMessage);
  } catch (err) {
    return NextResponse.json(
      {
        error: `AI summary failed (${getActiveProvider()}): ${
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

  const out = SummarySchema.safeParse(json);
  if (!out.success) {
    return NextResponse.json(
      { error: "Summary failed schema" },
      { status: 502 },
    );
  }

  await prisma.response.update({
    where: { id: response.id },
    data: { summary: out.data },
  });

  return NextResponse.json(out.data);
}
