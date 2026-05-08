import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";

export default async function KnowledgePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = await getOwnedOrganization(session.user.id);
  const snippets = org
    ? await prisma.snippet.findMany({
        where: { organizationId: org.id },
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { chunks: true } } },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
          <p className="text-sm text-gray-500 mt-1">
            Text snippets that AI can reference when generating surveys and
            quizzes.
          </p>
        </div>
        <Link
          href="/dashboard/knowledge/new"
          className="bg-black text-white text-sm px-4 py-2 rounded-md hover:opacity-90 transition"
        >
          New snippet
        </Link>
      </div>

      {snippets.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
          <p className="text-gray-500">
            No snippets yet. Add your first one to give AI context.
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
          {snippets.map((s) => (
            <li key={s.id}>
              <Link
                href={`/dashboard/knowledge/${s.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <div>
                  <div className="font-medium text-gray-900">{s.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {s._count.chunks}{" "}
                    {s._count.chunks === 1 ? "chunk" : "chunks"} · Updated{" "}
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-xs text-gray-400">→</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
