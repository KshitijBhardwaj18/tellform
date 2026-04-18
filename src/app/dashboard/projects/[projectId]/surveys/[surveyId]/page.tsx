import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSurvey } from "@/lib/access";
import { ShareLink } from "./ShareLink";
import { ModeToggle } from "./ModeToggle";

type Question = { id: string; question: string };
type Answer = { questionId: string; answer: string };

export default async function SurveyAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string; surveyId: string }>;
}) {
  const { projectId, surveyId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const survey = await getOwnedSurvey(session.user.id, surveyId);
  if (!survey || survey.projectId !== projectId) notFound();

  const responses = await prisma.response.findMany({
    where: { surveyId: survey.id },
    orderBy: { createdAt: "desc" },
  });

  const questions = (survey.questions as unknown as Question[]) ?? [];
  const totalResponses = responses.length;
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
          href={`/dashboard/projects/${projectId}`}
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← {survey.project.name}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{survey.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {questions.length} {questions.length === 1 ? "question" : "questions"} ·
            Created {new Date(survey.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            surveyId={survey.id}
            initialMode={survey.mode === "voice" ? "voice" : "text"}
          />
          <ShareLink surveyId={survey.id} />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Total responses" value={totalResponses.toString()} />
        <Stat label="Completion rate" value={`${completionRate}%`} />
        <Stat
          label="Latest response"
          value={
            responses[0]
              ? new Date(responses[0].createdAt).toLocaleDateString()
              : "—"
          }
        />
      </div>

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

      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Responses
        </h2>
        {responses.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-500">No responses yet. Share the survey link to start collecting.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {responses.map((r) => {
              const answers = (r.answers as unknown as Answer[]) ?? [];
              const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));
              return (
                <li
                  key={r.id}
                  className="bg-white border border-gray-200 rounded-lg p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{r.respondentName}</div>
                      <div className="text-xs text-gray-500">{r.respondentEmail}</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>
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
            })}
          </ul>
        )}
      </section>
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
