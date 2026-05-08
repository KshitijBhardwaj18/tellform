import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";
import { DynamicConfigSchema } from "@/lib/interviewer";

const Body = z.object({
  title: z.string().min(1).max(200),
  config: DynamicConfigSchema,
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const org = await getOwnedOrganization(session.user.id);
  if (!org) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { title, config } = parsed.data;

  const survey = await prisma.survey.create({
    data: {
      title,
      kind: "dynamic",
      questions: [],
      objective: config.objective,
      anchors: config.anchors,
      checkpoints: config.checkpoints,
      budget: config.budget,
      stopConditions: config.stopConditions,
      persona: config.persona ?? null,
      organizationId: org.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ surveyId: survey.id });
}
