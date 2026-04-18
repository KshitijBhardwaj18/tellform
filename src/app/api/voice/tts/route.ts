import { NextResponse } from "next/server";
import { z } from "zod";
import { speak } from "@/lib/voice/tts";

export const runtime = "nodejs";

const Body = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const stream = await speak(parsed.data.text);
    return new Response(stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "TTS error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
