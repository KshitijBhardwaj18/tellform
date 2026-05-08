"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DynamicSurveyBuilder,
  toApiPayload,
  validateDraft,
  type DynamicConfigDraft,
} from "./DynamicSurveyBuilder";

export function EditDynamicSurveyForm({
  surveyId,
  initial,
}: {
  surveyId: string;
  initial: DynamicConfigDraft;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DynamicConfigDraft>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = toApiPayload(draft);
      const res = await fetch(`/api/surveys/${surveyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to save changes");
      }
      router.push(`/dashboard/surveys/${surveyId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <DynamicSurveyBuilder draft={draft} setDraft={setDraft} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-black text-white px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition text-sm font-medium"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/surveys/${surveyId}`)}
          className="text-sm text-gray-600 hover:text-black transition"
        >
          Cancel
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
