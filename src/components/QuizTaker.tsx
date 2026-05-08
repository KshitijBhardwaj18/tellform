"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceQuiz } from "./VoiceQuiz";

export type QuizQuestion =
  | {
      id: string;
      type: "mcq";
      question: string;
      options: string[];
    }
  | {
      id: string;
      type: "open";
      question: string;
    };

type Mode = "text" | "voice";
type Step = "intro" | "question" | "voice" | "done";

export function QuizTaker({
  quizId,
  title,
  questions,
  mode = "text",
}: {
  quizId: string;
  title: string;
  questions: QuizQuestion[];
  mode?: Mode;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === "intro") nameRef.current?.focus();
    if (step === "question") inputRef.current?.focus();
  }, [step, current]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submit-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId,
          respondentName: name.trim(),
          respondentEmail: email.trim(),
          answers: questions.map((q) => ({
            questionId: q.id,
            answer: answers[q.id] ?? "",
          })),
        }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "intro") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !email.trim()) return;
            setStep(mode === "voice" ? "voice" : "question");
          }}
          className="w-full max-w-xl space-y-10 animate-fadeIn"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight">
              {title}
            </h1>
            <p className="mt-3 text-gray-500">
              {mode === "voice"
                ? "This is a voice quiz. Before we start, tell us a bit about you."
                : "Before we start, tell us a bit about you."}
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
              className="bg-black text-white px-6 py-3 rounded-md hover:opacity-90 transition"
            >
              Start →
            </button>
            <span className="text-xs text-gray-400">
              {mode === "voice" ? "we'll ask for mic access" : "press Enter ↵"}
            </span>
          </div>
        </form>
      </div>
    );
  }

  if (step === "voice") {
    return (
      <VoiceQuiz
        quizId={quizId}
        name={name}
        email={email}
        questions={questions}
        onDone={() => setStep("done")}
      />
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div className="animate-fadeIn">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-3xl font-medium">Thank you!</h1>
          <p className="mt-2 text-gray-500">Your answers have been submitted.</p>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const isLast = current === questions.length - 1;
  const value = answers[q.id] ?? "";

  function setValue(v: string) {
    setAnswers((a) => ({ ...a, [q.id]: v }));
  }

  function next(e?: React.FormEvent) {
    e?.preventDefault();
    if (!value.trim()) return;
    if (isLast) submit();
    else setCurrent((c) => c + 1);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-6 py-4 text-sm text-gray-400">
        {current + 1} of {questions.length}
      </div>
      <div className="flex-1 flex items-center justify-center px-6">
        <form
          key={q.id}
          onSubmit={next}
          className="w-full max-w-xl animate-fadeIn"
        >
          <h2 className="text-2xl md:text-3xl font-medium mb-8 leading-snug">
            {q.question}
          </h2>

          {q.type === "mcq" ? (
            <ul className="space-y-2">
              {q.options.map((opt) => {
                const selected = value === opt;
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      onClick={() => setValue(opt)}
                      className={`w-full text-left px-4 py-3 rounded-md border text-base transition ${
                        selected
                          ? "border-black bg-black text-white"
                          : "border-gray-300 hover:border-gray-500"
                      }`}
                    >
                      {opt}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <textarea
              ref={inputRef}
              rows={3}
              value={value}
              onChange={(e) => setValue(e.target.value)}
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
          )}

          <div className="mt-8 flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting || !value.trim()}
              className="bg-black text-white px-6 py-3 rounded-md hover:opacity-90 disabled:opacity-50 transition"
            >
              {submitting
                ? "Submitting…"
                : isLast
                ? "Submit"
                : "OK ✓"}
            </button>
            <span className="text-xs text-gray-400">
              {q.type === "mcq"
                ? "click or tap to choose"
                : isLast
                ? "press Enter ↵ to submit"
                : "press Enter ↵ to continue"}
            </span>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
