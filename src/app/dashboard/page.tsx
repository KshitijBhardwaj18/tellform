import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = await getOwnedOrganization(session.user.id);
  const surveys = org
    ? await prisma.survey.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { responses: true } } },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Surveys</h1>
          <p className="text-sm text-gray-500 mt-1">
            Open-ended conversational forms.
          </p>
        </div>
        <Link
          href="/dashboard/surveys/new"
          className="bg-black text-white text-sm px-4 py-2 rounded-md hover:opacity-90 transition"
        >
          New survey
        </Link>
      </div>

      {surveys.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
          <p className="text-gray-500">
            No surveys yet. Create your first AI-generated survey.
          </p>
        </div>
      ) : (
        <ul className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
          {surveys.map((s) => (
            <li key={s.id}>
              <Link
                href={`/dashboard/surveys/${s.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <div>
                  <div className="font-medium text-gray-900">{s.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                        s.kind === "dynamic"
                          ? "bg-purple-50 text-purple-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {s.kind === "dynamic" ? "Dynamic" : "Scripted"}
                    </span>
                    <span>
                      {s.mode === "voice" ? "Voice" : "Text"} · Created{" "}
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {s._count.responses}{" "}
                  {s._count.responses === 1 ? "response" : "responses"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
