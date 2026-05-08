import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { generateDynamicConfigJson, getActiveProvider } from "@/lib/ai";
import { DynamicConfigSchema } from "@/lib/interviewer";

const Body = z.object({
  prompt: z.string().min(3).max(1000),
});

const GeneratedSchema = z
  .object({
    title: z.string().min(1).max(200),
  })
  .and(DynamicConfigSchema);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let raw: string;
  try {
    raw = await generateDynamicConfigJson(parsed.data.prompt);
  } catch (err) {
    return NextResponse.json(
      {
        error: `AI generation failed (${getActiveProvider()}): ${
          err instanceof Error ? err.message : "unknown"
        }`,
      },
      { status: 502 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid AI JSON" }, { status: 502 });
  }

  const out = GeneratedSchema.safeParse(json);
  if (!out.success) {
    return NextResponse.json(
      { error: "AI output failed schema", details: out.error.flatten() },
      { status: 502 },
    );
  }

  return NextResponse.json(out.data);
}
