import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedQuiz } from "@/lib/access";
import { ShareLink } from "./ShareLink";
import { ModeToggle } from "./ModeToggle";

type QuizQuestion =
  | {
      id: string;
      type: "mcq";
      question: string;
      options: string[];
      correctAnswer: string;
    }
  | {
      id: string;
      type: "open";
      question: string;
      correctAnswer: string;
    };

type Answer = { questionId: string; answer: string };
type ScoreItem = { questionId: string; score: number; rationale?: string };
type Score = { items: ScoreItem[]; total: number; max: number };

export default async function QuizAdminPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const quiz = await getOwnedQuiz(session.user.id, quizId);
  if (!quiz) notFound();

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId: quiz.id },
    orderBy: { createdAt: "desc" },
  });

  const questions = (quiz.questions as unknown as QuizQuestion[]) ?? [];
  const totalAttempts = attempts.length;

  const avgScore =
    totalAttempts === 0
      ? 0
      : attempts.reduce((sum, a) => {
          const s = a.score as unknown as Score | null;
          if (!s || !s.max) return sum;
          return sum + s.total / s.max;
        }, 0) / totalAttempts;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/quizzes"
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← Quizzes
        </Link>
      </div>

      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{quiz.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {questions.length} {questions.length === 1 ? "question" : "questions"} ·
            Created {new Date(quiz.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle
            quizId={quiz.id}
            initialMode={quiz.mode === "voice" ? "voice" : "text"}
          />
          <ShareLink quizId={quiz.id} />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Total attempts" value={totalAttempts.toString()} />
        <Stat
          label="Average score"
          value={totalAttempts === 0 ? "—" : `${Math.round(avgScore * 100)}%`}
        />
        <Stat
          label="Latest attempt"
          value={
            attempts[0]
              ? new Date(attempts[0].createdAt).toLocaleDateString()
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
              <div className="flex items-start gap-3">
                <span className="text-gray-400">{i + 1}.</span>
                <div className="flex-1">
                  <div className="text-gray-900">{q.question}</div>
                  {q.type === "mcq" && (
                    <ul className="mt-1 text-xs text-gray-500 space-y-0.5">
                      {q.options.map((opt) => (
                        <li
                          key={opt}
                          className={
                            opt === q.correctAnswer
                              ? "text-green-700 font-medium"
                              : ""
                          }
                        >
                          • {opt}
                          {opt === q.correctAnswer && " ✓"}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.type === "open" && (
                    <div className="mt-1 text-xs text-green-700">
                      Expected: {q.correctAnswer}
                    </div>
                  )}
                </div>
                <span className="text-xs uppercase tracking-wide text-gray-400">
                  {q.type === "mcq" ? "MCQ" : "Open"}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Attempts
        </h2>
        {attempts.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-500">
              No attempts yet. Share the quiz link to start collecting.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {attempts.map((a) => {
              const answers = (a.answers as unknown as Answer[]) ?? [];
              const score = a.score as unknown as Score;
              const answerMap = new Map(
                answers.map((x) => [x.questionId, x.answer]),
              );
              const scoreMap = new Map(
                (score?.items ?? []).map((x) => [x.questionId, x]),
              );
              const pct =
                score && score.max
                  ? Math.round((score.total / score.max) * 100)
                  : 0;
              return (
                <li
                  key={a.id}
                  className="bg-white border border-gray-200 rounded-lg p-5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{a.respondentName}</div>
                      <div className="text-xs text-gray-500">{a.respondentEmail}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold text-gray-900">
                        {score?.total ?? 0} / {score?.max ?? questions.length}
                      </div>
                      <div className="text-xs text-gray-500">{pct}% · {new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-3">
                    {questions.map((q) => {
                      const item = scoreMap.get(q.id);
                      const ans = answerMap.get(q.id);
                      const isFull = item?.score === 1;
                      const isZero = item?.score === 0;
                      return (
                        <div key={q.id}>
                          <dt className="text-xs text-gray-500 flex items-center justify-between gap-3">
                            <span>{q.question}</span>
                            <span
                              className={`text-xs font-medium ${
                                isFull
                                  ? "text-green-700"
                                  : isZero
                                  ? "text-red-700"
                                  : "text-amber-700"
                              }`}
                            >
                              {item?.score ?? 0}/1
                            </span>
                          </dt>
                          <dd className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                            {ans || (
                              <span className="text-gray-400 italic">No answer</span>
                            )}
                          </dd>
                          {item?.rationale && (
                            <div className="text-xs text-gray-500 mt-0.5 italic">
                              {item.rationale}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
