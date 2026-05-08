import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";
import { CreateSurveyForm } from "@/components/CreateSurveyForm";

export default async function CreateSurveyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const org = await getOwnedOrganization(session.user.id);
  const snippetCount = org
    ? await prisma.snippet.count({ where: { organizationId: org.id } })
    : 0;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← Surveys
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a survey</h1>
        <p className="text-sm text-gray-500 mt-1">
          Describe what you want to learn. AI will generate the questions.
        </p>
      </div>
      <CreateSurveyForm hasKnowledgeBase={snippetCount > 0} />
    </div>
  );
}
