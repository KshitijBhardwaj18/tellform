import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedSnippet } from "@/lib/access";
import { stripHtml, replaceSnippetChunks } from "@/lib/rag";

const Body = z.object({
  title: z.string().min(1).max(200).optional(),
  contentHtml: z.string().min(1).max(200_000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ snippetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { snippetId } = await params;
  const owned = await getOwnedSnippet(session.user.id, snippetId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data: {
    title?: string;
    contentHtml?: string;
    contentText?: string;
  } = {};
  if (parsed.data.title != null) data.title = parsed.data.title;
  let contentChanged = false;
  if (parsed.data.contentHtml != null) {
    const text = stripHtml(parsed.data.contentHtml);
    if (!text) {
      return NextResponse.json({ error: "Snippet is empty" }, { status: 400 });
    }
    data.contentHtml = parsed.data.contentHtml;
    data.contentText = text;
    contentChanged = text !== owned.contentText;
  }

  await prisma.snippet.update({ where: { id: snippetId }, data });

  if (contentChanged && data.contentText) {
    try {
      await replaceSnippetChunks(snippetId, data.contentText);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Embedding failed: ${err instanceof Error ? err.message : "unknown"}`,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ id: snippetId });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ snippetId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { snippetId } = await params;
  const owned = await getOwnedSnippet(session.user.id, snippetId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.snippet.delete({ where: { id: snippetId } });
  return NextResponse.json({ ok: true });
}
