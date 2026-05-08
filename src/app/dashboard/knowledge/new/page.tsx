import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SnippetEditor } from "@/components/SnippetEditor";

export default async function NewSnippetPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New snippet</h1>
        <p className="text-sm text-gray-500 mt-1">
          Paste or write anything relevant — docs, FAQs, product specs.
          AI will reference it when generating.
        </p>
      </div>
      <SnippetEditor />
    </div>
  );
}
