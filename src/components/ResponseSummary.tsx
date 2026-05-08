"use client";

import { useState } from "react";

export type ResponseSummaryShape = {
  oneLine: string;
  completion: "completed" | "abandoned" | "refused";
  engagement: "high" | "medium" | "low" | "hostile";
  keyInsights: string[];
  notableQuotes: string[];
};

export function ResponseSummary({
  responseId,
  initial,
}: {
  responseId: string;
  initial: ResponseSummaryShape | null;
}) {
  const [summary, setSummary] = useState<ResponseSummaryShape | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/responses/${responseId}/summarize`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not summarize");
      }
      const data = (await res.json()) as ResponseSummaryShape;
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!summary) {
    return (
      <div className="border border-dashed border-gray-200 rounded-lg p-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          AI summary not generated yet.
        </span>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="text-xs bg-black text-white px-3 py-1.5 rounded-md hover:opacity-90 disabled:opacity-50 transition"
        >
          {loading ? "Summarizing…" : "Summarize with AI"}
        </button>
        {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 leading-relaxed">
          {summary.oneLine}
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="text-[10px] uppercase tracking-wide text-gray-400 hover:text-gray-700 transition shrink-0"
          title="Regenerate"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill
          label={summary.completion}
          tone={
            summary.completion === "completed"
              ? "green"
              : summary.completion === "abandoned"
              ? "yellow"
              : "red"
          }
        />
        <Pill
          label={`engagement: ${summary.engagement}`}
          tone={
            summary.engagement === "high"
              ? "green"
              : summary.engagement === "medium"
              ? "gray"
              : summary.engagement === "low"
              ? "yellow"
              : "red"
          }
        />
      </div>
      {summary.keyInsights.length > 0 && (
        <ul className="text-xs text-gray-700 space-y-1 list-disc pl-4">
          {summary.keyInsights.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
      )}
      {summary.notableQuotes.length > 0 && (
        <div className="space-y-1">
          {summary.notableQuotes.map((q, i) => (
            <div
              key={i}
              className="text-xs text-gray-600 italic border-l-2 border-gray-300 pl-2"
            >
              "{q}"
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "yellow" | "red" | "gray";
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700"
      : tone === "yellow"
      ? "bg-yellow-50 text-yellow-700"
      : tone === "red"
      ? "bg-red-50 text-red-700"
      : "bg-gray-100 text-gray-600";
  return (
    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}
