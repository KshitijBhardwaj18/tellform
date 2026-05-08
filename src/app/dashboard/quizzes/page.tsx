import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";

export default async function QuizzesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = await getOwnedOrganization(session.user.id);
  const quizzes = org
    ? await prisma.quiz.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { attempts: true } } },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quizzes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Scored AI quizzes with multiple choice and open questions.
          </p>
        </div>
        <Link
          href="/dashboard/quizzes/new"
          className="bg-black text-white text-sm px-4 py-2 rounded-md hover:opacity-90 transition"
        >
          New quiz
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
          <p className="text-gray-500">No quizzes yet. Generate your first one.</p>
        </div>
      ) : (
        <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
          {quizzes.map((q) => (
            <li key={q.id}>
              <Link
                href={`/dashboard/quizzes/${q.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <div>
                  <div className="font-medium text-gray-900">{q.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {q.mode === "voice" ? "Voice" : "Text"} · Created{" "}
                    {new Date(q.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {q._count.attempts}{" "}
                  {q._count.attempts === 1 ? "attempt" : "attempts"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
