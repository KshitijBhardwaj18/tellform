"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DynamicSurveyBuilder,
  emptyDraft,
  toApiPayload,
  validateDraft,
  type DynamicConfigDraft,
} from "./DynamicSurveyBuilder";

type Kind = "scripted" | "dynamic";

export function CreateSurveyForm({
  hasKnowledgeBase,
}: {
  hasKnowledgeBase: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("scripted");

  return (
    <div className="space-y-6">
      <KindToggle kind={kind} onChange={setKind} />
      {kind === "scripted" ? (
        <ScriptedForm
          hasKnowledgeBase={hasKnowledgeBase}
          onCreated={(id) => router.push(`/dashboard/surveys/${id}`)}
        />
      ) : (
        <DynamicForm onCreated={(id) => router.push(`/dashboard/surveys/${id}`)} />
      )}
    </div>
  );
}

// ---------- Kind picker ----------

function KindToggle({
  kind,
  onChange,
}: {
  kind: Kind;
  onChange: (k: Kind) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <KindCard
        active={kind === "scripted"}
        onClick={() => onChange("scripted")}
        title="Scripted"
        description="Fixed questions generated up front. Best when you know what to ask."
      />
      <KindCard
        active={kind === "dynamic"}
        onClick={() => onChange("dynamic")}
        title="Dynamic"
        description="An AI interviewer adapts each question to the answer. Best for discovery."
      />
    </div>
  );
}

function KindCard({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl p-5 border transition ${
        active
          ? "border-black bg-black text-white"
          : "border-gray-200 bg-white hover:border-gray-400"
      }`}
    >
      <div className="font-medium">{title}</div>
      <div
        className={`text-xs mt-1 leading-relaxed ${
          active ? "text-white/70" : "text-gray-500"
        }`}
      >
        {description}
      </div>
    </button>
  );
}

// ---------- Scripted ----------

function ScriptedForm({
  hasKnowledgeBase,
  onCreated,
}: {
  hasKnowledgeBase: boolean;
  onCreated: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [useKb, setUseKb] = useState(hasKnowledgeBase);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          useKnowledgeBase: useKb && hasKnowledgeBase,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to generate survey");
      }
      const { surveyId } = await res.json();
      onCreated(surveyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="Describe the survey you want — e.g. 'Customer feedback for a new mobile app onboarding flow'"
          autoFocus
          className="w-full border-0 outline-none resize-none text-base placeholder:text-gray-400 focus:ring-0 p-0"
        />
        <KnowledgeToggle
          enabled={useKb}
          onChange={setUseKb}
          available={hasKnowledgeBase}
        />
      </div>

      <SubmitRow
        label={submitting ? "Generating…" : "Generate survey"}
        disabled={submitting || !prompt.trim()}
        submitting={submitting}
        note="Crafting questions with AI…"
        error={error}
      />
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
      className={`flex items-center gap-3 text-sm border-t border-gray-100 pt-4 ${
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

// ---------- Dynamic ----------

type Phase = "seed" | "review";

function DynamicForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [phase, setPhase] = useState<Phase>("seed");
  const [seedPrompt, setSeedPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DynamicConfigDraft>(emptyDraft());

  async function generate() {
    if (seedPrompt.trim().length < 3) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/surveys/dynamic/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: seedPrompt.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to generate config");
      }
      const data = await res.json();
      setDraft({
        title: data.title ?? "",
        objective: data.objective ?? "",
        persona: data.persona ?? "warm, curious, concise",
        anchors:
          (data.anchors ?? []).map(
            (a: { id?: string; question: string }, i: number) => ({
              id: a.id ?? `a${i + 1}`,
              question: a.question,
            }),
          ),
        checkpoints:
          (data.checkpoints ?? []).map(
            (c: { id?: string; description: string }, i: number) => ({
              id: c.id ?? `c${i + 1}`,
              description: c.description,
            }),
          ),
        maxQuestions: data.budget?.maxQuestions ?? 8,
        maxFollowUps: data.budget?.maxFollowUpsPerAnchor ?? 2,
        stopConditions: data.stopConditions ?? [],
      });
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  function startBlank() {
    setDraft(emptyDraft());
    setPhase("review");
  }

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
      const res = await fetch("/api/surveys/dynamic/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toApiPayload(draft)),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to create dynamic survey");
      }
      const { surveyId } = await res.json();
      onCreated(surveyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (phase === "seed") {
    return (
      <div className="space-y-5">
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <div>
            <div className="text-sm font-medium text-gray-900">
              Describe what you want to learn
            </div>
            <div className="text-xs text-gray-500 mt-1">
              The AI will draft an objective, anchor questions, checkpoints, and
              budget. You can edit everything before saving.
            </div>
          </div>
          <textarea
            value={seedPrompt}
            onChange={(e) => setSeedPrompt(e.target.value)}
            rows={5}
            placeholder="e.g. Why our customers cancel in their first week, focusing on onboarding friction and feature gaps"
            autoFocus
            className="w-full border-0 outline-none resize-none text-base placeholder:text-gray-400 focus:ring-0 p-0"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={generating || seedPrompt.trim().length < 3}
            className="bg-black text-white px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition text-sm font-medium"
          >
            {generating ? "Generating…" : "Generate with AI"}
          </button>
          <button
            type="button"
            onClick={startBlank}
            className="text-sm text-gray-600 hover:text-black transition"
          >
            or start from scratch →
          </button>
          {generating && (
            <span className="text-sm text-gray-500">Drafting your interview…</span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPhase("seed")}
          className="text-sm text-gray-500 hover:text-gray-900 transition"
        >
          ← Start over
        </button>
        <div className="text-xs text-gray-500">
          Edit anything below — add, remove, or rewrite.
        </div>
      </div>

      <DynamicSurveyBuilder draft={draft} setDraft={setDraft} />

      <SubmitRow
        label={submitting ? "Creating…" : "Create dynamic survey"}
        disabled={submitting}
        submitting={submitting}
        note="Saving config…"
        error={error}
      />
    </form>
  );
}

// ---------- Shared ----------

function SubmitRow({
  label,
  disabled,
  submitting,
  note,
  error,
}: {
  label: string;
  disabled: boolean;
  submitting: boolean;
  note: string;
  error: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={disabled}
        className="bg-black text-white px-5 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition text-sm font-medium"
      >
        {label}
      </button>
      {submitting && <span className="text-sm text-gray-500">{note}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
