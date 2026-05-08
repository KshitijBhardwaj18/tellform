import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  loadConfigFromSurvey,
  loadStateOrInit,
  loadTranscript,
  nextTurn,
} from "@/lib/interviewer";

const Body = z.object({
  responseId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.string().max(5000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const response = await prisma.response.findUnique({
    where: { id: parsed.data.responseId },
    select: {
      id: true,
      completedAt: true,
      state: true,
      transcript: true,
      survey: {
        select: {
          id: true,
          kind: true,
          objective: true,
          anchors: true,
          checkpoints: true,
          budget: true,
          stopConditions: true,
          persona: true,
        },
      },
    },
  });
  if (!response) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (response.completedAt) {
    return NextResponse.json({ done: true, reason: "already complete" });
  }
  if (response.survey.kind !== "dynamic") {
    return NextResponse.json({ error: "Not a dynamic survey" }, { status: 400 });
  }

  const config = loadConfigFromSurvey(response.survey);
  if (!config) {
    return NextResponse.json({ error: "Survey config invalid" }, { status: 500 });
  }

  const state = loadStateOrInit(response.state);
  const transcript = loadTranscript(response.transcript);

  // Reject if the answer is for a stale question — defends against double submits.
  if (
    !state.pendingQuestion ||
    state.pendingQuestion.questionId !== parsed.data.questionId
  ) {
    return NextResponse.json(
      { error: "Stale question id" },
      { status: 409 },
    );
  }

  const result = await nextTurn(config, state, transcript, {
    questionId: parsed.data.questionId,
    answer: parsed.data.answer,
  });

  await prisma.response.update({
    where: { id: response.id },
    data: {
      state: result.state as object,
      transcript: result.transcript,
      answers: result.transcript
        .filter((t) => t.answer && t.answer.trim().length > 0)
        .map((t) => ({ questionId: t.questionId, answer: t.answer })),
      completedAt: result.kind === "done" ? new Date() : null,
    },
  });

  if (result.kind === "done") {
    return NextResponse.json({
      done: true,
      reason: result.reason,
      reply: result.reply ?? null,
    });
  }

  return NextResponse.json({
    done: false,
    reply: result.pending.reply ?? null,
    question: {
      id: result.pending.questionId,
      question: result.pending.question,
    },
  });
}
