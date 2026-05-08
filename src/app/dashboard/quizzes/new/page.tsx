import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";
import { CreateQuizForm } from "@/components/CreateQuizForm";

export default async function CreateQuizPage() {
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
          href="/dashboard/quizzes"
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← Quizzes
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a quiz</h1>
        <p className="text-sm text-gray-500 mt-1">
          Describe a topic. AI will generate MCQ + open-ended questions and
          score answers automatically.
        </p>
      </div>
      <CreateQuizForm hasKnowledgeBase={snippetCount > 0} />
    </div>
  );
}
