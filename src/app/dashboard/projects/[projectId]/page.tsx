import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedProject } from "@/lib/access";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const project = await getOwnedProject(session.user.id, projectId);
  if (!project) notFound();

  const surveys = await prisma.survey.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← Projects
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {surveys.length} {surveys.length === 1 ? "survey" : "surveys"}
          </p>
        </div>
        <Link
          href={`/dashboard/projects/${project.id}/create-survey`}
          className="bg-black text-white text-sm px-4 py-2 rounded-md hover:opacity-90 transition"
        >
          Create survey
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
                href={`/dashboard/projects/${project.id}/surveys/${s.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
              >
                <div>
                  <div className="font-medium text-gray-900">{s.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Created {new Date(s.createdAt).toLocaleDateString()}
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
