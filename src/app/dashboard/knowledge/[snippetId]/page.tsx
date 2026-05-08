import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOwnedSnippet } from "@/lib/access";
import { SnippetEditor } from "@/components/SnippetEditor";

export default async function SnippetPage({
  params,
}: {
  params: Promise<{ snippetId: string }>;
}) {
  const { snippetId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const snippet = await getOwnedSnippet(session.user.id, snippetId);
  if (!snippet) notFound();

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link
          href="/dashboard/knowledge"
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← Knowledge
        </Link>
      </div>
      <SnippetEditor
        snippetId={snippet.id}
        initialTitle={snippet.title}
        initialHtml={snippet.contentHtml}
      />
    </div>
  );
}
