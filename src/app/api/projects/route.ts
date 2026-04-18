import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOwnedOrganization } from "@/lib/access";

const Body = z.object({ name: z.string().min(1).max(100) });

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

  const project = await prisma.project.create({
    data: { name: parsed.data.name, organizationId: org.id },
  });

  return NextResponse.json(project);
}
