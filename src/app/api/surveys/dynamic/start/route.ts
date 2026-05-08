import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  initialState,
  loadConfigFromSurvey,
  nextTurn,
  type Turn,
} from "@/lib/interviewer";
import { generateGreetingJson } from "@/lib/ai";

const Body = z.object({
  surveyId: z.string().min(1),
  respondentName: z.string().min(1).max(200),
  respondentEmail: z.string().email().max(320),
  mode: z.enum(["text", "voice"]).optional(),
});

const GreetingSchema = z.object({ greeting: z.string().min(1).max(400) });

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "there";
}

async function makeGreeting(input: {
  name: string;
  title: string;
  objective: string;
  persona: string | null;
  mode: "text" | "voice";
}): Promise<string> {
  const userMessage = JSON.stringify(
    {
      respondentFirstName: firstName(input.name),
      surveyTitle: input.title,
      objective: input.objective,
      persona: input.persona ?? "warm, curious, concise",
      mode: input.mode,
    },
    null,
    2,
  );
  try {
    const raw = await generateGreetingJson(userMessage);
    const parsed = GreetingSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data.greeting.trim();
  } catch {
    // fall through
  }
  // deterministic fallback
  const name = firstName(input.name);
  return input.mode === "voice"
    ? `Thanks for joining, ${name} — I'd love to hear your thoughts. Just speak your answers naturally.`
    : `Thanks for joining, ${name}. A few quick questions — short answers are fine.`;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
    where: { id: parsed.data.surveyId },
    select: {
      id: true,
      title: true,
      kind: true,
      mode: true,
      objective: true,
      anchors: true,
      checkpoints: true,
      budget: true,
      stopConditions: true,
      persona: true,
    },
  });
  if (!survey || survey.kind !== "dynamic") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const config = loadConfigFromSurvey(survey);
  if (!config) {
    return NextResponse.json(
      { error: "Survey config invalid" },
      { status: 500 },
    );
  }

  // Run the engine and generate the greeting in parallel.
  const requestedMode = parsed.data.mode ?? (survey.mode === "voice" ? "voice" : "text");
  const [result, greeting] = await Promise.all([
    nextTurn(config, initialState(), []),
    makeGreeting({
      name: parsed.data.respondentName,
      title: survey.title,
      objective: survey.objective ?? survey.title,
      persona: survey.persona,
      mode: requestedMode,
    }),
  ]);

  // Attach greeting to the first pending question + transcript entry.
  let state = result.state;
  let transcript: Turn[] = result.transcript;
  if (result.kind === "question") {
    state = {
      ...state,
      pendingQuestion: state.pendingQuestion
        ? { ...state.pendingQuestion, reply: greeting }
        : state.pendingQuestion,
    };
    transcript = transcript.map((t, i) =>
      i === transcript.length - 1 && t.questionId === result.pending.questionId
        ? { ...t, reply: greeting }
        : t,
    );
  }

  const response = await prisma.response.create({
    data: {
      surveyId: survey.id,
      respondentName: parsed.data.respondentName,
      respondentEmail: parsed.data.respondentEmail,
      answers: [],
      state: state as object,
      transcript,
      completedAt: result.kind === "done" ? new Date() : null,
    },
    select: { id: true },
  });

  if (result.kind === "done") {
    return NextResponse.json({
      responseId: response.id,
      done: true,
      reason: result.reason,
    });
  }

  return NextResponse.json({
    responseId: response.id,
    done: false,
    reply: greeting,
    question: {
      id: result.pending.questionId,
      question: result.pending.question,
    },
  });
}
