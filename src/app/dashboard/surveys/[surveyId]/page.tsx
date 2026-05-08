import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSurvey } from "@/lib/access";
import { ShareLink } from "./ShareLink";
import { ModeToggle } from "./ModeToggle";
import {
  ResponseSummary,
  type ResponseSummaryShape,
} from "@/components/ResponseSummary";

type Question = { id: string; question: string };
type Answer = { questionId: string; answer: string };
type Turn = {
  questionId: string;
  question: string;
  source: "anchor" | "ai";
  topicTag?: string;
  whyGenerated?: string;
  reply?: string;
  answer: string;
  askedAt: string;
  answeredAt?: string;
};
type Anchor = { id: string; question: string };
type Checkpoint = { id: string; description: string };

export default async function SurveyAnalyticsPage({
  params,
}: {
  params: Promise<{ surveyId: string }>;
}) {
  const { surveyId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const survey = await getOwnedSurvey(session.user.id, surveyId);
  if (!survey) notFound();

  const responses = await prisma.response.findMany({
    where: { surveyId: survey.id },
    orderBy: { createdAt: "desc" },
  });

  const isDynamic = survey.kind === "dynamic";
  const questions = (survey.questions as unknown as Question[]) ?? [];
  const anchors = (survey.anchors as unknown as Anchor[] | null) ?? [];
  const checkpoints = (survey.checkpoints as unknown as Checkpoint[] | null) ?? [];

  const totalResponses = responses.length;
  const completedResponses = responses.filter((r) => r.completedAt).length;
  const avgQuestionsPerResponse = isDynamic
    ? totalResponses === 0
      ? 0
      : Math.round(
          responses.reduce((sum, r) => {
            const t = (r.transcript as unknown as Turn[] | null) ?? [];
            return sum + t.filter((x) => x.answer && x.answer.trim().length > 0).length;
          }, 0) / totalResponses,
        )
      : 0;

  const totalAnswerableSlots = totalResponses * Math.max(questions.length, 1);
  const filledAnswers = responses.reduce((sum, r) => {
    const answers = (r.answers as unknown as Answer[]) ?? [];
    return sum + answers.filter((a) => a.answer && a.answer.trim().length > 0).length;
  }, 0);
  const completionRate =
    totalAnswerableSlots === 0
      ? 0
      : Math.round((filledAnswers / totalAnswerableSlots) * 100);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← Surveys
        </Link>
      </div>

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{survey.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isDynamic ? (
              <>Dynamic interview · {anchors.length} anchors · {checkpoints.length} checkpoints</>
            ) : (
              <>{questions.length} {questions.length === 1 ? "question" : "questions"}</>
            )}{" "}
            · Created {new Date(survey.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            surveyId={survey.id}
            initialMode={survey.mode === "voice" ? "voice" : "text"}
          />
          {isDynamic && (
            <Link
              href={`/dashboard/surveys/${survey.id}/edit`}
              className="text-sm border border-gray-200 hover:border-gray-400 transition rounded-lg px-3 py-1.5 text-gray-700"
            >
              Edit
            </Link>
          )}
          <ShareLink surveyId={survey.id} />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Total responses" value={totalResponses.toString()} />
        {isDynamic ? (
          <>
            <Stat label="Completed" value={`${completedResponses}/${totalResponses}`} />
            <Stat label="Avg questions" value={avgQuestionsPerResponse.toString()} />
          </>
        ) : (
          <>
            <Stat label="Completion rate" value={`${completionRate}%`} />
            <Stat
              label="Latest response"
              value={
                responses[0]
                  ? new Date(responses[0].createdAt).toLocaleDateString()
                  : "—"
              }
            />
          </>
        )}
      </div>

      {isDynamic && survey.objective && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Objective
          </h2>
          <p className="bg-white border border-gray-200 rounded-lg p-5 text-sm text-gray-800">
            {survey.objective}
          </p>
        </section>
      )}

      {isDynamic ? (
        <>
          <section>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              Anchors
            </h2>
            <ol className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
              {anchors.map((a, i) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <span className="text-gray-400 mr-3">{i + 1}.</span>
                  {a.question}
                </li>
              ))}
            </ol>
          </section>
          {checkpoints.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
                Checkpoints
              </h2>
              <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
                {checkpoints.map((c) => (
                  <li key={c.id} className="px-5 py-3 text-sm">
                    <span className="text-xs text-gray-400 font-mono mr-3">
                      {c.id}
                    </span>
                    {c.description}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Questions
          </h2>
          <ol className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
            {questions.map((q, i) => (
              <li key={q.id} className="px-5 py-3 text-sm">
                <span className="text-gray-400 mr-3">{i + 1}.</span>
                {q.question}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Responses
        </h2>
        {responses.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-500">
              No responses yet. Share the survey link to start collecting.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {responses.map((r) =>
              isDynamic ? (
                <DynamicResponseCard
                  key={r.id}
                  responseId={r.id}
                  respondentName={r.respondentName}
                  respondentEmail={r.respondentEmail}
                  createdAt={r.createdAt}
                  completedAt={r.completedAt}
                  transcript={(r.transcript as unknown as Turn[] | null) ?? []}
                  summary={
                    (r.summary as unknown as ResponseSummaryShape | null) ??
                    null
                  }
                />
              ) : (
                <ScriptedResponseCard
                  key={r.id}
                  respondentName={r.respondentName}
                  respondentEmail={r.respondentEmail}
                  createdAt={r.createdAt}
                  questions={questions}
                  answers={(r.answers as unknown as Answer[]) ?? []}
                />
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function ScriptedResponseCard({
  respondentName,
  respondentEmail,
  createdAt,
  questions,
  answers,
}: {
  respondentName: string;
  respondentEmail: string;
  createdAt: Date;
  questions: Question[];
  answers: Answer[];
}) {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));
  return (
    <li className="bg-white border border-gray-200 rounded-lg p-5">
      <ResponseHeader
        name={respondentName}
        email={respondentEmail}
        createdAt={createdAt}
      />
      <dl className="mt-4 space-y-3">
        {questions.map((q) => (
          <div key={q.id}>
            <dt className="text-xs text-gray-500">{q.question}</dt>
            <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
              {answerMap.get(q.id) || (
                <span className="text-gray-400 italic">No answer</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function DynamicResponseCard({
  responseId,
  respondentName,
  respondentEmail,
  createdAt,
  completedAt,
  transcript,
  summary,
}: {
  responseId: string;
  respondentName: string;
  respondentEmail: string;
  createdAt: Date;
  completedAt: Date | null;
  transcript: Turn[];
  summary: ResponseSummaryShape | null;
}) {
  const answered = transcript.filter(
    (t) => t.answer && t.answer.trim().length > 0,
  );
  return (
    <li className="bg-white border border-gray-200 rounded-lg p-5">
      <ResponseHeader
        name={respondentName}
        email={respondentEmail}
        createdAt={createdAt}
        rightSlot={
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              completedAt
                ? "bg-green-50 text-green-700"
                : "bg-yellow-50 text-yellow-700"
            }`}
          >
            {completedAt ? "Completed" : "In progress"}
          </span>
        }
      />
      <div className="mt-4">
        <ResponseSummary responseId={responseId} initial={summary} />
      </div>
      <ol className="mt-4 space-y-4">
        {answered.map((t, i) => (
          <li key={t.questionId} className="border-l-2 border-gray-100 pl-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">Q{i + 1}</span>
              <span
                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  t.source === "ai"
                    ? "bg-purple-50 text-purple-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {t.source === "ai" ? "AI" : "Anchor"}
              </span>
              {t.topicTag && (
                <span className="text-[10px] text-gray-500 font-mono">
                  {t.topicTag}
                </span>
              )}
            </div>
            {t.reply && (
              <div className="text-xs text-gray-500 italic mb-1">
                ↳ {t.reply}
              </div>
            )}
            <div className="text-sm font-medium text-gray-900">
              {t.question}
            </div>
            {t.whyGenerated && (
              <div className="text-xs text-gray-400 italic mt-0.5">
                why: {t.whyGenerated}
              </div>
            )}
            <div className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap">
              {t.answer}
            </div>
          </li>
        ))}
        {answered.length === 0 && (
          <li className="text-sm text-gray-400 italic">No answers yet.</li>
        )}
      </ol>
    </li>
  );
}

function ResponseHeader({
  name,
  email,
  createdAt,
  rightSlot,
}: {
  name: string;
  email: string;
  createdAt: Date;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="font-medium text-gray-900">{name}</div>
        <div className="text-xs text-gray-500">{email}</div>
      </div>
      <div className="flex items-center gap-2">
        {rightSlot}
        <div className="text-xs text-gray-500">
          {new Date(createdAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
