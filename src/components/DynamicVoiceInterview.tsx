"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceOrb, type OrbState } from "./VoiceOrb";

const MAX_FAILS = 2;
const VAD_SILENCE_MS = 1400;
const VAD_SPEECH_THRESHOLD = 0.03;
const NO_SPEECH_TIMEOUT_MS = 12_000;
const MAX_RECORD_MS = 60_000;

type Question = { id: string; question: string };

type Phase =
  | { kind: "init" }
  | { kind: "starting" }
  | { kind: "speaking"; question: Question; prefix?: string }
  | { kind: "listening"; question: Question }
  | { kind: "processing"; question: Question }
  | { kind: "submitting"; question: Question }
  | { kind: "saying_goodbye"; text: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function DynamicVoiceInterview({
  surveyId,
  name,
  email,
  onDone,
}: {
  surveyId: string;
  name: string;
  email: string;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "init" });
  const [amplitude, setAmplitude] = useState(0);
  const [turn, setTurn] = useState(0);

  const responseIdRef = useRef<string | null>(null);
  const failsRef = useRef(0);
  const lastQuestionRef = useRef<Question | null>(null);
  const lastPrefixRef = useRef<string | undefined>(undefined);

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

  // Amplitude + VAD loop.
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

  // Mount: mic + audio context, then start the interview.
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
        setPhase({ kind: "starting" });
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
    if (phase.kind === "starting") {
      startInterview();
      return;
    }
    if (phase.kind === "speaking") {
      lastQuestionRef.current = phase.question;
      lastPrefixRef.current = phase.prefix;
      return runSpeaking(phase.question, phase.prefix);
    }
    if (phase.kind === "saying_goodbye") {
      return runGoodbye(phase.text);
    }
    if (phase.kind === "listening") {
      lastQuestionRef.current = phase.question;
      return runListening(phase.question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Space bar: stop recording manually.
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

  async function startInterview() {
    try {
      const res = await fetch("/api/surveys/dynamic/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyId,
          respondentName: name,
          respondentEmail: email,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not start interview");
      }
      const data = await res.json();
      responseIdRef.current = data.responseId;
      if (data.done) {
        setPhase({ kind: "done" });
        onDone();
      } else {
        setTurn(1);
        setPhase({
          kind: "speaking",
          question: data.question,
          prefix: (data.reply as string | null | undefined) ?? undefined,
        });
      }
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not start interview",
      });
    }
  }

  function runSpeaking(question: Question, prefix?: string) {
    const controller = new AbortController();
    const fails = failsRef.current;
    const cleanPrefix = (prefix ?? "").trim();
    const text =
      fails === 0
        ? cleanPrefix
          ? `${cleanPrefix} ${question.question}`
          : question.question
        : fails === 1
        ? `Sorry, I didn't catch that. ${question.question}`
        : `One more time. ${question.question}`;

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
            setPhase({ kind: "listening", question });
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

  function runListening(question: Question) {
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
        onTranscribed(question, "");
        return;
      }
      setPhase({ kind: "processing", question });
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
        onTranscribed(question, data.text || "");
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

  async function onTranscribed(question: Question, text: string) {
    const clean = text.trim();
    if (!clean) {
      const nextFails = failsRef.current + 1;
      failsRef.current = nextFails;
      if (nextFails >= MAX_FAILS) {
        setPhase({ kind: "error", message: "I'm having trouble hearing you." });
        return;
      }
      setPhase({ kind: "speaking", question });
      return;
    }
    failsRef.current = 0;
    setPhase({ kind: "submitting", question });

    try {
      const res = await fetch("/api/surveys/dynamic/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId: responseIdRef.current,
          questionId: question.id,
          answer: clean,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not submit answer");
      }
      const data = await res.json();
      if (data.done) {
        const goodbye =
          (data.reply as string | null | undefined)?.trim() ||
          "Thanks for sharing — that's all I needed.";
        setPhase({ kind: "saying_goodbye", text: goodbye });
        return;
      }
      setTurn((t) => t + 1);
      setPhase({
        kind: "speaking",
        question: data.question,
        prefix: (data.reply as string | null | undefined) ?? undefined,
      });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Submission failed",
      });
    }
  }

  function retry() {
    failsRef.current = 0;
    const q = lastQuestionRef.current;
    if (!q) {
      setPhase({ kind: "starting" });
      return;
    }
    setPhase({ kind: "speaking", question: q, prefix: lastPrefixRef.current });
  }

  function runGoodbye(text: string) {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          if (!controller.signal.aborted) {
            setPhase({ kind: "done" });
            onDone();
          }
          return;
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
            setPhase({ kind: "done" });
            onDone();
          }
        };
        await audio.play();
      } catch {
        if (!controller.signal.aborted) {
          setPhase({ kind: "done" });
          onDone();
        }
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

  function activeQuestion(): Question | null {
    if (
      phase.kind === "speaking" ||
      phase.kind === "listening" ||
      phase.kind === "processing" ||
      phase.kind === "submitting"
    )
      return phase.question;
    return null;
  }

  const currentQ = activeQuestion();

  const orbState: OrbState =
    phase.kind === "speaking" || phase.kind === "saying_goodbye"
      ? "speaking"
      : phase.kind === "listening"
      ? "listening"
      : phase.kind === "processing" ||
        phase.kind === "submitting" ||
        phase.kind === "starting" ||
        phase.kind === "init"
      ? "thinking"
      : "idle";

  const statusLabel =
    phase.kind === "init"
      ? "Preparing…"
      : phase.kind === "starting"
      ? "Starting"
      : phase.kind === "speaking"
      ? "Speaking"
      : phase.kind === "saying_goodbye"
      ? "Wrapping up"
      : phase.kind === "listening"
      ? "Listening"
      : phase.kind === "processing"
      ? "Transcribing"
      : phase.kind === "submitting"
      ? "Thinking"
      : phase.kind === "done"
      ? "Done"
      : "";

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0b14] text-white">
      <header className="flex items-center justify-between px-6 py-4 text-sm">
        <div className="text-white/50">
          {turn > 0 && phase.kind !== "done" ? `Question ${turn}` : " "}
        </div>
        <div className="text-xs tracking-widest uppercase text-white/40">
          {statusLabel}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-10">
        <VoiceOrb state={orbState} amplitude={amplitude} size={280} />

        <div className="min-h-[96px] max-w-xl w-full text-center">
          {currentQ && phase.kind === "speaking" && (
            <div key={currentQ.id} className="space-y-2 animate-fadeIn">
              {phase.prefix && (
                <p className="text-sm text-white/50 italic">{phase.prefix}</p>
              )}
              <h2 className="text-2xl md:text-3xl font-medium leading-snug">
                {currentQ.question}
              </h2>
            </div>
          )}
          {phase.kind === "saying_goodbye" && (
            <p className="text-xl text-white/80 animate-fadeIn">{phase.text}</p>
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
        {phase.kind === "listening" ? "Stop recording ⎵ (space)" : " "}
      </footer>
    </div>
  );
}
