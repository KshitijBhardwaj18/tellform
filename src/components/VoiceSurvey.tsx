"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceOrb, type OrbState } from "./VoiceOrb";
import type { Question } from "./SurveyTaker";

const MAX_FAILS = 2;
const VAD_SILENCE_MS = 1200;
const VAD_SPEECH_THRESHOLD = 0.03;
const NO_SPEECH_TIMEOUT_MS = 10_000;
const MAX_RECORD_MS = 30_000;

type Phase =
  | { kind: "init" }
  | { kind: "speaking"; qIdx: number }
  | { kind: "listening"; qIdx: number }
  | { kind: "processing"; qIdx: number }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const ACKS = ["Okay.", "Got it.", "Thanks.", "Alright.", "Mm-hm."];
function pickAck() {
  return ACKS[Math.floor(Math.random() * ACKS.length)];
}

export function VoiceSurvey({
  surveyId,
  name,
  email,
  questions,
  onDone,
}: {
  surveyId: string;
  name: string;
  email: string;
  questions: Question[];
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "init" });
  const [amplitude, setAmplitude] = useState(0);

  const answersRef = useRef<Record<string, string>>({});
  const failsRef = useRef(0);
  const lastQIdxRef = useRef(0);
  const ackPrefixRef = useRef<string>("");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const streamAnalyserRef = useRef<AnalyserNode | null>(null);
  const activeAnalyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUrlRef = useRef<string | null>(null);
  const vadRef = useRef<
    | {
        sawSpeech: boolean;
        silenceStart: number;
        recordStart: number;
      }
    | null
  >(null);

  // Amplitude + VAD loop (one RAF for the life of the component).
  useEffect(() => {
    let alive = true;
    let raf = 0;
    const tick = () => {
      if (!alive) return;
      const analyser = activeAnalyserRef.current;
      if (analyser) {
        const arr = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(arr);
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = (arr[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / arr.length);
        setAmplitude((prev) => prev * 0.55 + Math.min(1, rms * 3.2) * 0.45);

        const vad = vadRef.current;
        if (vad) {
          const now = performance.now();
          if (rms > VAD_SPEECH_THRESHOLD) {
            vad.sawSpeech = true;
            vad.silenceStart = 0;
          } else if (vad.sawSpeech) {
            if (!vad.silenceStart) vad.silenceStart = now;
            else if (now - vad.silenceStart > VAD_SILENCE_MS) {
              stopRecording();
            }
          }
          const elapsed = now - vad.recordStart;
          if (!vad.sawSpeech && elapsed > NO_SPEECH_TIMEOUT_MS) stopRecording();
          if (elapsed > MAX_RECORD_MS) stopRecording();
        }
      } else {
        setAmplitude((prev) => prev * 0.9);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Mount: request mic + create AudioContext, then start speaking Q1.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new Ctx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        streamRef.current = stream;
        audioCtxRef.current = ctx;
        streamAnalyserRef.current = analyser;
        setPhase({ kind: "speaking", qIdx: 0 });
      } catch {
        setPhase({
          kind: "error",
          message:
            "Microphone access is required for voice mode. Allow mic access and reload, or switch to text.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unmount cleanup.
  useEffect(
    () => () => {
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (ttsUrlRef.current) URL.revokeObjectURL(ttsUrlRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );

  // Phase-driven side effects.
  useEffect(() => {
    if (phase.kind === "speaking") {
      lastQIdxRef.current = phase.qIdx;
      return runSpeaking(phase.qIdx);
    }
    if (phase.kind === "listening") {
      lastQIdxRef.current = phase.qIdx;
      return runListening(phase.qIdx);
    }
    if (phase.kind === "submitting") {
      submitAll();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Space bar: stop recording manually while listening.
  useEffect(() => {
    if (phase.kind !== "listening") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  function runSpeaking(qIdx: number) {
    const controller = new AbortController();
    const q = questions[qIdx];
    const fails = failsRef.current;
    const ack = ackPrefixRef.current;
    ackPrefixRef.current = "";
    const text =
      fails === 0
        ? ack
          ? `${ack} ${q.question}`
          : q.question
        : fails === 1
        ? `Sorry, I didn't catch that. ${q.question}`
        : `One more time. ${q.question}`;

    (async () => {
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "TTS failed" }));
          throw new Error(err.error ?? "TTS failed");
        }
        const blob = await res.blob();
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        ttsUrlRef.current = url;
        const audio = new Audio(url);
        audio.preload = "auto";
        ttsAudioRef.current = audio;

        const ctx = audioCtxRef.current!;
        if (ctx.state === "suspended") await ctx.resume();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        activeAnalyserRef.current = analyser;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          ttsUrlRef.current = null;
          activeAnalyserRef.current = null;
          if (!controller.signal.aborted) {
            setPhase({ kind: "listening", qIdx });
          }
        };
        audio.onerror = () => {
          if (!controller.signal.aborted) {
            setPhase({
              kind: "error",
              message: "Could not play the question audio.",
            });
          }
        };
        await audio.play();
      } catch (e) {
        if (controller.signal.aborted) return;
        const msg = e instanceof Error ? e.message : "Voice synthesis error";
        setPhase({ kind: "error", message: msg });
      }
    })();

    return () => {
      controller.abort();
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (ttsUrlRef.current) {
        URL.revokeObjectURL(ttsUrlRef.current);
        ttsUrlRef.current = null;
      }
      activeAnalyserRef.current = null;
    };
  }

  function runListening(qIdx: number) {
    const stream = streamRef.current;
    if (!stream) {
      setPhase({ kind: "error", message: "Mic stream unavailable." });
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    recorderRef.current = recorder;
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      vadRef.current = null;
      activeAnalyserRef.current = null;
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size < 800) {
        onTranscribed(qIdx, "");
        return;
      }
      setPhase({ kind: "processing", qIdx });
      try {
        const res = await fetch("/api/voice/stt", {
          method: "POST",
          headers: { "Content-Type": type },
          body: blob,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "STT failed" }));
          throw new Error(err.error ?? "STT failed");
        }
        const data = (await res.json()) as { text: string };
        onTranscribed(qIdx, data.text || "");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Transcription error";
        setPhase({ kind: "error", message: msg });
      }
    };

    activeAnalyserRef.current = streamAnalyserRef.current;
    vadRef.current = {
      sawSpeech: false,
      silenceStart: 0,
      recordStart: performance.now(),
    };
    recorder.start();

    return () => {
      if (recorder.state === "recording") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
      vadRef.current = null;
      activeAnalyserRef.current = null;
    };
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (r && r.state === "recording") {
      try {
        r.stop();
      } catch {
        // ignore
      }
    }
  }

  function onTranscribed(qIdx: number, text: string) {
    const clean = text.trim();
    if (!clean) {
      const nextFails = failsRef.current + 1;
      failsRef.current = nextFails;
      if (nextFails >= MAX_FAILS) {
        setPhase({
          kind: "error",
          message: "I'm having trouble hearing you.",
        });
        return;
      }
      setPhase({ kind: "speaking", qIdx });
      return;
    }
    failsRef.current = 0;
    answersRef.current[questions[qIdx].id] = clean;
    const nextIdx = qIdx + 1;
    if (nextIdx >= questions.length) {
      setPhase({ kind: "submitting" });
    } else {
      ackPrefixRef.current = pickAck();
      setPhase({ kind: "speaking", qIdx: nextIdx });
    }
  }

  async function submitAll() {
    try {
      const res = await fetch("/api/submit-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyId,
          respondentName: name,
          respondentEmail: email,
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: answersRef.current[q.id] ?? "",
          })),
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setPhase({ kind: "done" });
      onDone();
    } catch {
      setPhase({ kind: "error", message: "Submission failed. Please retry." });
    }
  }

  function retry() {
    failsRef.current = 0;
    setPhase({ kind: "speaking", qIdx: lastQIdxRef.current });
  }

  function activeQIdx(): number | null {
    if (
      phase.kind === "speaking" ||
      phase.kind === "listening" ||
      phase.kind === "processing"
    )
      return phase.qIdx;
    return null;
  }

  const qIdx = activeQIdx();
  const currentQ = qIdx != null ? questions[qIdx] : null;

  const orbState: OrbState =
    phase.kind === "speaking"
      ? "speaking"
      : phase.kind === "listening"
      ? "listening"
      : phase.kind === "processing" ||
        phase.kind === "submitting" ||
        phase.kind === "init"
      ? "thinking"
      : "idle";

  const statusLabel =
    phase.kind === "init"
      ? "Preparing…"
      : phase.kind === "speaking"
      ? "Speaking"
      : phase.kind === "listening"
      ? "Listening"
      : phase.kind === "processing"
      ? "Thinking"
      : phase.kind === "submitting"
      ? "Submitting"
      : phase.kind === "done"
      ? "Done"
      : "";

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b14] text-white">
      <header className="flex items-center justify-between px-6 py-4 text-sm">
        <div className="text-white/50">
          {qIdx != null ? `${qIdx + 1} of ${questions.length}` : "\u00A0"}
        </div>
        <div className="text-xs tracking-widest uppercase text-white/40">
          {statusLabel}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-10">
        <VoiceOrb state={orbState} amplitude={amplitude} size={280} />

        <div className="min-h-[96px] max-w-xl w-full text-center">
          {currentQ && phase.kind === "speaking" && (
            <h2
              key={currentQ.id}
              className="text-2xl md:text-3xl font-medium leading-snug animate-fadeIn"
            >
              {currentQ.question}
            </h2>
          )}
          {phase.kind === "error" && (
            <div className="space-y-4 animate-fadeIn">
              <p className="text-red-300">{phase.message}</p>
              <button
                onClick={retry}
                className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 transition"
              >
                Try again
              </button>
            </div>
          )}
          {phase.kind === "done" && (
            <p className="text-white/60 animate-fadeIn">
              Thanks — your response is in.
            </p>
          )}
        </div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-white/30">
        {phase.kind === "listening" ? "Stop recording ⎵ (space)" : "\u00A0"}
      </footer>
    </div>
  );
}
