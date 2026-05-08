import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedQuiz } from "@/lib/access";

const Body = z.object({
  mode: z.enum(["text", "voice"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quizId } = await params;
  const owned = await getOwnedQuiz(session.user.id, quizId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updated = await prisma.quiz.update({
    where: { id: quizId },
    data: parsed.data,
    select: { id: true, mode: true },
  });

  return NextResponse.json(updated);
}
