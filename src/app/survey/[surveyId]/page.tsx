import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SurveyTaker, type Question } from "@/components/SurveyTaker";
import { DynamicSurveyTaker } from "@/components/DynamicSurveyTaker";

export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      title: true,
      questions: true,
      mode: true,
      kind: true,
    },
  });

  if (!survey) notFound();

  const voiceConfigured =
    process.env.VOICE_ENABLED === "true" &&
    !!process.env.ELEVENLABS_API_KEY &&
    !!process.env.DEEPGRAM_API_KEY;
  const mode = survey.mode === "voice" && voiceConfigured ? "voice" : "text";

  if (survey.kind === "dynamic") {
    return (
      <DynamicSurveyTaker
        surveyId={survey.id}
        title={survey.title}
        mode={mode}
      />
    );
  }

  const questions = (survey.questions as unknown as Question[]) ?? [];

  return (
    <SurveyTaker
      surveyId={survey.id}
      title={survey.title}
      questions={questions}
      mode={mode}
    />
  );
}
