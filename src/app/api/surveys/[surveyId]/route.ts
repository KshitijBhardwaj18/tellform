import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSurvey } from "@/lib/access";
import { DynamicConfigSchema } from "@/lib/interviewer";

const Body = z
  .object({
    mode: z.enum(["text", "voice"]).optional(),
    title: z.string().min(1).max(200).optional(),
    config: DynamicConfigSchema.optional(),
  })
  .refine((v) => v.mode || v.title || v.config, {
    message: "Nothing to update",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ surveyId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { surveyId } = await params;
  const owned = await getOwnedSurvey(session.user.id, surveyId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.mode) data.mode = parsed.data.mode;
  if (parsed.data.title) data.title = parsed.data.title;
  if (parsed.data.config) {
    if (owned.kind !== "dynamic") {
      return NextResponse.json(
        { error: "Cannot set config on scripted survey" },
        { status: 400 },
      );
    }
    const c = parsed.data.config;
    data.objective = c.objective;
    data.anchors = c.anchors;
    data.checkpoints = c.checkpoints;
    data.budget = c.budget;
    data.stopConditions = c.stopConditions;
    data.persona = c.persona ?? null;
  }

  const updated = await prisma.survey.update({
    where: { id: surveyId },
    data,
    select: { id: true, mode: true, title: true, kind: true },
  });

  return NextResponse.json(updated);
}
