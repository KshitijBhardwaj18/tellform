"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateQuizForm({
  hasKnowledgeBase,
}: {
  hasKnowledgeBase: boolean;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [useKb, setUseKb] = useState(hasKnowledgeBase);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          questionCount,
          useKnowledgeBase: useKb && hasKnowledgeBase,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to generate quiz");
      }
      const { quizId } = await res.json();
      router.push(`/dashboard/quizzes/${quizId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Topic
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="Describe the quiz — e.g. 'Basic JavaScript for new bootcamp students'"
          autoFocus
          className="w-full border border-gray-300 rounded-md p-4 text-base outline-none focus:border-black resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Number of questions: <span className="text-gray-900">{questionCount}</span>
        </label>
        <input
          type="range"
          min={1}
          max={20}
          value={questionCount}
          onChange={(e) => setQuestionCount(Number(e.target.value))}
          className="w-full accent-black"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1</span>
          <span>20</span>
        </div>
      </div>

      <KnowledgeToggle
        enabled={useKb}
        onChange={setUseKb}
        available={hasKnowledgeBase}
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !prompt.trim()}
          className="bg-black text-white px-5 py-2.5 rounded-md hover:opacity-90 disabled:opacity-50 transition"
        >
          {submitting ? "Generating..." : "Generate quiz"}
        </button>
        {submitting && (
          <span className="text-sm text-gray-500">Crafting questions with AI…</span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

function KnowledgeToggle({
  enabled,
  onChange,
  available,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  available: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 text-sm border border-gray-200 rounded-md px-4 py-3 ${
        available ? "cursor-pointer" : "opacity-60 cursor-not-allowed"
      }`}
    >
      <input
        type="checkbox"
        checked={enabled && available}
        disabled={!available}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-black"
      />
      <div>
        <div className="text-gray-900">Use knowledge base</div>
        <div className="text-xs text-gray-500">
          {available
            ? "AI will reference your snippets when generating questions."
            : "Add snippets in Knowledge to enable this."}
        </div>
      </div>
    </label>
  );
}
