import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSurvey } from "@/lib/access";

const Body = z.object({
  mode: z.enum(["text", "voice"]).optional(),
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

  const updated = await prisma.survey.update({
    where: { id: surveyId },
    data: parsed.data,
    select: { id: true, mode: true },
  });

  return NextResponse.json(updated);
}
