/**
 * Text-to-speech provider seam.
 * Currently: ElevenLabs Flash v2.5 (streaming).
 * Add providers by extending the switch below — do not branch at call sites.
 */

export type TtsProvider = "elevenlabs";

export function getActiveTtsProvider(): TtsProvider {
  return "elevenlabs";
}

export async function speak(text: string): Promise<ReadableStream<Uint8Array>> {
  const provider = getActiveTtsProvider();
  switch (provider) {
    case "elevenlabs":
      return speakElevenLabs(text);
  }
}

async function speakElevenLabs(text: string): Promise<ReadableStream<Uint8Array>> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const model = process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${detail}`);
  }
  return res.body;
}
