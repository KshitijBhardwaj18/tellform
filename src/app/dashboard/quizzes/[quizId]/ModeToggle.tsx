"use client";

import { useState } from "react";

type Mode = "text" | "voice";

export function ModeToggle({
  quizId,
  initialMode,
}: {
  quizId: string;
  initialMode: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: Mode) {
    if (next === mode || saving) return;
    const prev = mode;
    setMode(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (!res.ok) throw new Error("Could not save");
    } catch (err) {
      setMode(prev);
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs">
        {(["text", "voice"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => update(m)}
            disabled={saving}
            className={`px-3 py-1.5 rounded transition ${
              mode === m
                ? "bg-white text-gray-900 shadow-sm font-medium"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {m === "voice" ? "Voice" : "Text"}
          </button>
        ))}
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
