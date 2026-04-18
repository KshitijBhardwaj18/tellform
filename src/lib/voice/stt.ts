/**
 * Speech-to-text provider seam.
 * Currently: Deepgram Nova-3 (prerecorded).
 * Add providers by extending the switch below — do not branch at call sites.
 */

export type SttProvider = "deepgram";

export function getActiveSttProvider(): SttProvider {
  return "deepgram";
}

export type TranscribeResult = { text: string; durationMs: number };

export async function transcribe(
  audio: ArrayBuffer,
  contentType: string,
): Promise<TranscribeResult> {
  const provider = getActiveSttProvider();
  switch (provider) {
    case "deepgram":
      return transcribeDeepgram(audio, contentType);
  }
}

async function transcribeDeepgram(
  audio: ArrayBuffer,
  contentType: string,
): Promise<TranscribeResult> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set");

  const model = process.env.DEEPGRAM_MODEL ?? "nova-3";
  const url = `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(
    model,
  )}&smart_format=true&punctuate=true&language=en`;

  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${key}`,
      "Content-Type": contentType || "audio/webm",
    },
    body: audio,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Deepgram STT failed: ${res.status} ${detail}`);
  }

  const json = (await res.json()) as {
    results?: {
      channels?: {
        alternatives?: { transcript?: string }[];
      }[];
    };
  };
  const text =
    json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  return { text, durationMs: Date.now() - start };
}
