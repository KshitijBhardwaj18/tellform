import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";
import { CreateProjectForm } from "@/components/CreateProjectForm";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = await getOwnedOrganization(session.user.id);
  const projects = org
    ? await prisma.project.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { surveys: true } } },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            Group surveys by project to keep things organized.
          </p>
        </div>
        <CreateProjectForm />
      </div>

      {projects.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-12 text-center">
          <p className="text-gray-500">No projects yet. Create your first one.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/projects/${p.id}`}
                className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-400 transition"
              >
                <div className="font-medium text-gray-900">{p.name}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {p._count.surveys} {p._count.surveys === 1 ? "survey" : "surveys"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
