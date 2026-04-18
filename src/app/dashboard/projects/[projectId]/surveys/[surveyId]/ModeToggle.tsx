"use client";

import { useState } from "react";

export function ModeToggle({
  surveyId,
  initialMode,
}: {
  surveyId: string;
  initialMode: "text" | "voice";
}) {
  const [mode, setMode] = useState<"text" | "voice">(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: "text" | "voice") {
    if (next === mode || saving) return;
    const prev = mode;
    setMode(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${surveyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (!res.ok) throw new Error("Could not save");
    } catch (e) {
      setMode(prev);
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex rounded-md border border-gray-300 p-1 bg-white text-sm">
        <button
          type="button"
          onClick={() => update("text")}
          disabled={saving}
          className={`px-3 py-1.5 rounded-md transition ${
            mode === "text"
              ? "bg-black text-white"
              : "text-gray-600 hover:text-black"
          }`}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => update("voice")}
          disabled={saving}
          className={`px-3 py-1.5 rounded-md transition ${
            mode === "voice"
              ? "bg-black text-white"
              : "text-gray-600 hover:text-black"
          }`}
        >
          Voice
        </button>
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
