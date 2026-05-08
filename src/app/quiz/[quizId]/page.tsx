import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QuizTaker, type QuizQuestion } from "@/components/QuizTaker";

export default async function PublicQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { id: true, title: true, questions: true, mode: true },
  });

  if (!quiz) notFound();

  const dbQuestions = (quiz.questions as unknown as Array<{
    id: string;
    type: "mcq" | "open";
    question: string;
    options?: string[];
    correctAnswer?: string;
  }>) ?? [];

  // Strip correctAnswer before sending to client.
  const questions: QuizQuestion[] = dbQuestions.map((q) =>
    q.type === "mcq"
      ? { id: q.id, type: "mcq", question: q.question, options: q.options ?? [] }
      : { id: q.id, type: "open", question: q.question },
  );

  const voiceConfigured =
    process.env.VOICE_ENABLED === "true" &&
    !!process.env.ELEVENLABS_API_KEY &&
    !!process.env.DEEPGRAM_API_KEY;
  const mode = quiz.mode === "voice" && voiceConfigured ? "voice" : "text";

  return (
    <QuizTaker
      quizId={quiz.id}
      title={quiz.title}
      questions={questions}
      mode={mode}
    />
  );
}
