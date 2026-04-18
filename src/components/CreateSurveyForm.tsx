"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateSurveyForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to generate survey");
      }
      const { surveyId } = await res.json();
      router.push(`/dashboard/projects/${projectId}/surveys/${surveyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        placeholder="Describe the survey you want — e.g. 'Customer feedback for a new mobile app onboarding flow'"
        autoFocus
        className="w-full border border-gray-300 rounded-md p-4 text-base outline-none focus:border-black resize-none"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !prompt.trim()}
          className="bg-black text-white px-5 py-2.5 rounded-md hover:opacity-90 disabled:opacity-50 transition"
        >
          {submitting ? "Generating..." : "Generate survey"}
        </button>
        {submitting && (
          <span className="text-sm text-gray-500">
            Crafting questions with AI…
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
