import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  surveyId: z.string().min(1),
  respondentName: z.string().min(1).max(200),
  respondentEmail: z.string().email().max(320),
  answers: z
    .array(z.object({ questionId: z.string(), answer: z.string() }))
    .min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const survey = await prisma.survey.findUnique({
    where: { id: parsed.data.surveyId },
    select: { id: true },
  });
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const response = await prisma.response.create({
    data: {
      surveyId: parsed.data.surveyId,
      respondentName: parsed.data.respondentName,
      respondentEmail: parsed.data.respondentEmail,
      answers: parsed.data.answers,
    },
  });

  return NextResponse.json({ id: response.id });
}
