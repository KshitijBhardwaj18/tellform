import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";
import { stripHtml, replaceSnippetChunks } from "@/lib/rag";

const Body = z.object({
  title: z.string().min(1).max(200),
  contentHtml: z.string().min(1).max(200_000),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const org = await getOwnedOrganization(session.user.id);
  if (!org) return NextResponse.json({ error: "No organization" }, { status: 400 });

  const contentText = stripHtml(parsed.data.contentHtml);
  if (!contentText) {
    return NextResponse.json({ error: "Snippet is empty" }, { status: 400 });
  }

  const snippet = await prisma.snippet.create({
    data: {
      organizationId: org.id,
      title: parsed.data.title,
      contentHtml: parsed.data.contentHtml,
      contentText,
    },
  });

  try {
    await replaceSnippetChunks(snippet.id, contentText);
  } catch (err) {
    await prisma.snippet.delete({ where: { id: snippet.id } });
    return NextResponse.json(
      {
        error: `Embedding failed: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ id: snippet.id });
}
