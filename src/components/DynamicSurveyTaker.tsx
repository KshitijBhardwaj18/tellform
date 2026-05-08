"use client";

import { useEffect, useRef, useState } from "react";
import { DynamicVoiceInterview } from "./DynamicVoiceInterview";

type Mode = "text" | "voice";
type Step = "intro" | "question" | "voice" | "done" | "error";

type Question = { id: string; question: string };

export function DynamicSurveyTaker({
  surveyId,
  title,
  mode = "text",
}: {
  surveyId: string;
  title: string;
  mode?: Mode;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [responseId, setResponseId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === "intro") nameRef.current?.focus();
    if (step === "question") inputRef.current?.focus();
  }, [step, question?.id]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys/dynamic/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyId,
          respondentName: name.trim(),
          respondentEmail: email.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not start interview");
      }
      const data = await res.json();
      setResponseId(data.responseId);
      if (data.done) {
        setDoneMessage((data.reply as string | null) ?? null);
        setStep("done");
      } else {
        setQuestion(data.question);
        setReply((data.reply as string | null) ?? null);
        setTurnCount(1);
        setStep("question");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function next(e?: React.FormEvent) {
    e?.preventDefault();
    if (!answer.trim() || !question || !responseId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys/dynamic/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseId,
          questionId: question.id,
          answer: answer.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not submit answer");
      }
      const data = await res.json();
      setAnswer("");
      if (data.done) {
        setDoneMessage((data.reply as string | null) ?? null);
        setStep("done");
      } else {
        setQuestion(data.question);
        setReply((data.reply as string | null) ?? null);
        setTurnCount((c) => c + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "voice") {
    return (
      <DynamicVoiceInterview
        surveyId={surveyId}
        name={name}
        email={email}
        onDone={() => setStep("done")}
      />
    );
  }

  if (step === "intro") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !email.trim()) return;
            if (mode === "voice") {
              setStep("voice");
            } else {
              start(e);
            }
          }}
          className="w-full max-w-xl space-y-10 animate-fadeIn"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
              {title}
            </h1>
            <p className="mt-3 text-gray-500">
              {mode === "voice"
                ? "This is a voice interview. Before we start, tell us a bit about you."
                : "This is a conversational survey. Before we start, tell us a bit about you."}
            </p>
          </div>
          <div className="space-y-8">
            <Field label="Your name">
              <input
                ref={nameRef}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xl border-b-2 border-gray-300 focus:border-black outline-none py-2 bg-transparent"
              />
            </Field>
            <Field label="Your email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xl border-b-2 border-gray-300 focus:border-black outline-none py-2 bg-transparent"
              />
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="bg-black text-white px-6 py-3 rounded-md hover:opacity-90 disabled:opacity-50 transition"
            >
              {submitting ? "Starting…" : "Start →"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="animate-fadeIn max-w-md">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-3xl font-medium">Thank you!</h1>
          <p className="mt-2 text-gray-500">
            {doneMessage ?? "Your response has been recorded."}
          </p>
        </div>
      </div>
    );
  }

  if (step === "error" || !question) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-medium">Something went wrong</h1>
          <p className="mt-2 text-gray-500">{error ?? "Please try again."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-4 text-sm text-gray-400">Question {turnCount}</div>
      <div className="flex-1 flex items-center justify-center px-6">
        <form
          key={question.id}
          onSubmit={next}
          className="w-full max-w-xl animate-fadeIn"
        >
          {reply && (
            <p className="text-sm text-gray-400 italic mb-3 animate-fadeIn">
              {reply}
            </p>
          )}
          <h2 className="text-2xl md:text-3xl font-medium mb-8 leading-snug">
            {question.question}
          </h2>
          <textarea
            ref={inputRef}
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                next();
              }
            }}
            placeholder="Type your answer…"
            className="w-full text-xl border-b-2 border-gray-300 focus:border-black outline-none py-2 bg-transparent resize-none"
            required
          />
          <div className="mt-8 flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting || !answer.trim()}
              className="bg-black text-white px-6 py-3 rounded-md hover:opacity-90 disabled:opacity-50 transition"
            >
              {submitting ? "Thinking…" : "OK ✓"}
            </button>
            <span className="text-xs text-gray-400">press Enter ↵ to continue</span>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
