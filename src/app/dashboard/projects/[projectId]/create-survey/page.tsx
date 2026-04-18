import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOwnedProject } from "@/lib/access";
import { CreateSurveyForm } from "@/components/CreateSurveyForm";

export default async function CreateSurveyPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const project = await getOwnedProject(session.user.id, projectId);
  if (!project) notFound();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← {project.name}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a survey</h1>
        <p className="text-sm text-gray-500 mt-1">
          Describe what you want to learn. AI will generate the questions.
        </p>
      </div>
      <CreateSurveyForm projectId={project.id} />
    </div>
  );
}
