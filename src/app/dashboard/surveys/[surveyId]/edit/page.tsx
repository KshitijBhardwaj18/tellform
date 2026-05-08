import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOwnedSurvey } from "@/lib/access";
import { EditDynamicSurveyForm } from "@/components/EditDynamicSurveyForm";
import type {
  AnchorDraft,
  CheckpointDraft,
  DynamicConfigDraft,
} from "@/components/DynamicSurveyBuilder";

export default async function EditSurveyPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const survey = await getOwnedSurvey(session.user.id, surveyId);
  if (!survey || survey.kind !== "dynamic") notFound();

  const anchors = (survey.anchors as unknown as AnchorDraft[] | null) ?? [
    { id: "a1", question: "" },
  ];
  const checkpoints =
    (survey.checkpoints as unknown as CheckpointDraft[] | null) ?? [];
  const budget = (survey.budget as unknown as {
    maxQuestions?: number;
    maxFollowUpsPerAnchor?: number;
  } | null) ?? {};
  const stopConditions =
    (survey.stopConditions as unknown as string[] | null) ?? [];

  const initial: DynamicConfigDraft = {
    title: survey.title,
    objective: survey.objective ?? "",
    persona: survey.persona ?? "warm, curious, concise",
    anchors: anchors.length > 0 ? anchors : [{ id: "a1", question: "" }],
    checkpoints,
    maxQuestions: budget.maxQuestions ?? 8,
    maxFollowUps: budget.maxFollowUpsPerAnchor ?? 2,
    stopConditions,
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link
          href={`/dashboard/surveys/${survey.id}`}
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← {survey.title}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit configuration
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Changes affect future responses only.
        </p>
      </div>

      <EditDynamicSurveyForm surveyId={survey.id} initial={initial} />
    </div>
  );
}
