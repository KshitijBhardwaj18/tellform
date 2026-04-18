import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateSurveyJson, getActiveProvider } from "@/lib/ai";
import { getOwnedProject } from "@/lib/access";

const Body = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(3).max(1000),
});

const GeneratedSchema = z.object({
  title: z.string().min(1),
  questions: z
    .array(z.object({ id: z.string(), question: z.string().min(1) }))
    .min(1)
    .max(10),
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

  const project = await getOwnedProject(session.user.id, parsed.data.projectId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let raw: string;
  try {
    raw = await generateSurveyJson(parsed.data.prompt);
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

  const survey = await prisma.survey.create({
    data: {
      title: generated.data.title,
      questions: generated.data.questions,
      projectId: project.id,
    },
  });

  return NextResponse.json({ surveyId: survey.id, provider: getActiveProvider() });
}
