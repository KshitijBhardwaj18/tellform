"use client";

import { useState } from "react";

export type AnchorDraft = { id: string; question: string };
export type CheckpointDraft = { id: string; description: string };

export type DynamicConfigDraft = {
  title: string;
  objective: string;
  persona: string;
  anchors: AnchorDraft[];
  checkpoints: CheckpointDraft[];
  maxQuestions: number;
  maxFollowUps: number;
  stopConditions: string[];
};

export const emptyDraft = (): DynamicConfigDraft => ({
  title: "",
  objective: "",
  persona: "warm, curious, concise",
  anchors: [{ id: "a1", question: "" }],
  checkpoints: [],
  maxQuestions: 8,
  maxFollowUps: 2,
  stopConditions: [],
});

export function validateDraft(d: DynamicConfigDraft): string | null {
  if (!d.title.trim()) return "Title is required";
  if (d.objective.trim().length < 5) return "Objective is required";
  const anchors = d.anchors.filter((a) => a.question.trim());
  if (anchors.length === 0) return "Add at least one anchor question";
  return null;
}

export function toApiPayload(d: DynamicConfigDraft): {
  title: string;
  config: {
    objective: string;
    anchors: AnchorDraft[];
    checkpoints: CheckpointDraft[];
    budget: { maxQuestions: number; maxFollowUpsPerAnchor: number };
    stopConditions: string[];
    persona?: string;
  };
} {
  return {
    title: d.title.trim(),
    config: {
      objective: d.objective.trim(),
      anchors: d.anchors
        .map((a, i) => ({ id: a.id || `a${i + 1}`, question: a.question.trim() }))
        .filter((a) => a.question.length > 0),
      checkpoints: d.checkpoints
        .map((c, i) => ({
          id: c.id || `c${i + 1}`,
          description: c.description.trim(),
        }))
        .filter((c) => c.description.length > 0),
      budget: {
        maxQuestions: d.maxQuestions,
        maxFollowUpsPerAnchor: d.maxFollowUps,
      },
      stopConditions: d.stopConditions.map((s) => s.trim()).filter(Boolean),
      persona: d.persona.trim() || undefined,
    },
  };
}

export function DynamicSurveyBuilder({
  draft,
  setDraft,
}: {
  draft: DynamicConfigDraft;
  setDraft: (d: DynamicConfigDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <Field
          label="Survey title"
          hint="What appears on the dashboard."
        >
          <input
            type="text"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="e.g. Churn exit interview"
            className={inputClass}
          />
        </Field>
      </Card>

      <Card>
        <Field
          label="Objective"
          hint="The single goal that guides every generated question."
        >
          <textarea
            value={draft.objective}
            onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
            rows={3}
            placeholder="Understand the specific reason this user is canceling and whether we could have prevented it."
            className={`${inputClass} resize-none`}
          />
        </Field>
      </Card>

      <Card>
        <Field
          label="Anchor questions"
          hint="Must-ask questions, in order. The AI fills in follow-ups around these."
        >
          <ListEditor
            items={draft.anchors}
            valueOf={(a) => a.question}
            placeholder="What made you decide to cancel today?"
            onAdd={() =>
              setDraft({
                ...draft,
                anchors: [
                  ...draft.anchors,
                  { id: `a${draft.anchors.length + 1}`, question: "" },
                ],
              })
            }
            onRemove={(idx) =>
              setDraft({
                ...draft,
                anchors: draft.anchors.filter((_, i) => i !== idx),
              })
            }
            onChange={(idx, value) =>
              setDraft({
                ...draft,
                anchors: draft.anchors.map((x, i) =>
                  i === idx ? { ...x, question: value } : x,
                ),
              })
            }
          />
        </Field>
      </Card>

      <Card>
        <Field
          label="Checkpoints"
          hint="Topics that must be covered. The AI tracks which answers cover which checkpoint."
        >
          <ListEditor
            items={draft.checkpoints}
            valueOf={(c) => c.description}
            placeholder="The specific reason for canceling"
            onAdd={() =>
              setDraft({
                ...draft,
                checkpoints: [
                  ...draft.checkpoints,
                  {
                    id: `c${draft.checkpoints.length + 1}`,
                    description: "",
                  },
                ],
              })
            }
            onRemove={(idx) =>
              setDraft({
                ...draft,
                checkpoints: draft.checkpoints.filter((_, i) => i !== idx),
              })
            }
            onChange={(idx, value) =>
              setDraft({
                ...draft,
                checkpoints: draft.checkpoints.map((x, i) =>
                  i === idx ? { ...x, description: value } : x,
                ),
              })
            }
          />
        </Field>
      </Card>

      <Card>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Max questions" hint="Hard cap, total.">
            <input
              type="number"
              min={1}
              max={30}
              value={draft.maxQuestions}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maxQuestions: Math.max(
                    1,
                    Math.min(30, Number(e.target.value) || 1),
                  ),
                })
              }
              className={inputClass}
            />
          </Field>
          <Field label="Max follow-ups per anchor">
            <input
              type="number"
              min={0}
              max={10}
              value={draft.maxFollowUps}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maxFollowUps: Math.max(
                    0,
                    Math.min(10, Number(e.target.value) || 0),
                  ),
                })
              }
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <Field label="Persona" hint="Tone the interviewer adopts.">
          <input
            type="text"
            value={draft.persona}
            onChange={(e) => setDraft({ ...draft, persona: e.target.value })}
            placeholder="warm, curious, concise"
            className={inputClass}
          />
        </Field>
      </Card>

      <Card>
        <Field
          label="Stop conditions"
          hint="Optional. Plain English signals that end the interview early."
        >
          <ListEditor
            items={draft.stopConditions.map((s, i) => ({
              id: `s${i}`,
              value: s,
            }))}
            valueOf={(c) => (c as { value: string }).value}
            placeholder="user gives one-word answers twice in a row"
            onAdd={() =>
              setDraft({
                ...draft,
                stopConditions: [...draft.stopConditions, ""],
              })
            }
            onRemove={(idx) =>
              setDraft({
                ...draft,
                stopConditions: draft.stopConditions.filter((_, i) => i !== idx),
              })
            }
            onChange={(idx, value) =>
              setDraft({
                ...draft,
                stopConditions: draft.stopConditions.map((x, i) =>
                  i === idx ? value : x,
                ),
              })
            }
          />
        </Field>
      </Card>
    </div>
  );
}

const inputClass =
  "w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm outline-none focus:border-black transition";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function ListEditor<T>({
  items,
  placeholder,
  onAdd,
  onRemove,
  onChange,
  valueOf,
}: {
  items: T[];
  placeholder: string;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onChange: (idx: number, value: string) => void;
  valueOf: (item: T) => string;
}) {
  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <div className="text-xs text-gray-400 italic py-2">No items yet.</div>
      )}
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono w-6 shrink-0">
            {idx + 1}.
          </span>
          <input
            type="text"
            value={valueOf(item)}
            onChange={(e) => onChange(idx, e.target.value)}
            placeholder={placeholder}
            className={`flex-1 ${inputClass}`}
          />
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="text-gray-300 hover:text-red-500 text-base px-1.5 transition"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="text-sm text-gray-600 hover:text-black transition pt-1"
      >
        + Add
      </button>
    </div>
  );
}
