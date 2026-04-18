import { NextResponse } from "next/server";
import { transcribe } from "@/lib/voice/stt";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "audio/webm";
  if (!contentType.startsWith("audio/")) {
    return NextResponse.json(
      { error: "Expected audio/* content-type" },
      { status: 400 },
    );
  }

  const buf = await req.arrayBuffer();
  if (buf.byteLength === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Audio too large" }, { status: 413 });
  }

  try {
    const result = await transcribe(buf, contentType);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "STT error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
