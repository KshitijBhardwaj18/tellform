import { z } from "zod";
import { generateInterviewerTurnJson } from "./ai";

// ---------- Types stored on the Survey row ----------

export const AnchorSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
});
export type Anchor = z.infer<typeof AnchorSchema>;

export const CheckpointSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const BudgetSchema = z.object({
  maxQuestions: z.number().int().min(1).max(30),
  maxFollowUpsPerAnchor: z.number().int().min(0).max(10),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const DynamicConfigSchema = z.object({
  objective: z.string().min(5).max(1000),
  anchors: z.array(AnchorSchema).min(1).max(10),
  checkpoints: z.array(CheckpointSchema).min(0).max(15),
  budget: BudgetSchema,
  stopConditions: z.array(z.string().max(200)).max(10).default([]),
  persona: z.string().max(200).optional(),
});
export type DynamicConfig = z.infer<typeof DynamicConfigSchema>;

// ---------- Per-response interviewer state (the "notebook") ----------

export type CoveredCheckpoint = {
  checkpointId: string;
  confidence: number;
  evidence: string;
};

export type Turn = {
  questionId: string;
  question: string;
  source: "anchor" | "ai";
  anchorId?: string;
  topicTag?: string;
  whyGenerated?: string;
  reply?: string;
  answer: string;
  askedAt: string;
  answeredAt?: string;
};

export type InterviewerState = {
  currentAnchorIndex: number;
  followUpsOnCurrentAnchor: number;
  questionsAsked: number;
  covered: CoveredCheckpoint[];
  unresolvedThreads: string[];
  askedQuestions: string[];
  shouldStop: boolean;
  stopReason: string | null;
  pendingQuestion: PendingQuestion | null;
};

export type PendingQuestion = {
  questionId: string;
  question: string;
  source: "anchor" | "ai";
  anchorId?: string;
  topicTag?: string;
  whyGenerated?: string;
  reply?: string;
};

export const initialState = (): InterviewerState => ({
  currentAnchorIndex: 0,
  followUpsOnCurrentAnchor: 0,
  questionsAsked: 0,
  covered: [],
  unresolvedThreads: [],
  askedQuestions: [],
  shouldStop: false,
  stopReason: null,
  pendingQuestion: null,
});

// ---------- LLM unified-turn output schema ----------

const TurnOutSchema = z.object({
  covered: z
    .array(
      z.object({
        checkpointId: z.string(),
        confidence: z.number().min(0).max(1),
        evidence: z.string().max(400),
      }),
    )
    .default([]),
  unresolvedThreads: z.array(z.string().max(80)).max(5).default([]),
  reply: z.string().max(300).default(""),
  action: z.enum(["ask", "end"]),
  endReason: z.string().max(200).default(""),
  question: z.string().max(400).default(""),
  topicTag: z.string().max(80).default(""),
  whyGenerated: z.string().max(400).default(""),
});

// ---------- Decisions (used when there is NO last answer to feed the LLM) ----------

type Decision =
  | { kind: "stop"; reason: string }
  | { kind: "anchor"; anchor: Anchor }
  | { kind: "follow_up" }
  | { kind: "force_checkpoint"; checkpoint: Checkpoint };

function uncoveredCheckpoints(
  config: DynamicConfig,
  state: InterviewerState,
): Checkpoint[] {
  const coveredIds = new Set(
    state.covered.filter((c) => c.confidence >= 0.5).map((c) => c.checkpointId),
  );
  return config.checkpoints.filter((c) => !coveredIds.has(c.id));
}

function decideHint(config: DynamicConfig, state: InterviewerState): Decision {
  if (state.shouldStop) {
    return { kind: "stop", reason: state.stopReason ?? "stop signal" };
  }
  if (state.questionsAsked >= config.budget.maxQuestions) {
    return { kind: "stop", reason: "budget exhausted" };
  }

  const remainingBudget = config.budget.maxQuestions - state.questionsAsked;
  const uncovered = uncoveredCheckpoints(config, state);

  if (uncovered.length > 0 && remainingBudget <= uncovered.length) {
    return { kind: "force_checkpoint", checkpoint: uncovered[0] };
  }

  const anchors = config.anchors;
  const idx = state.currentAnchorIndex;

  if (idx >= anchors.length) {
    if (uncovered.length > 0 && remainingBudget > 0) {
      return { kind: "force_checkpoint", checkpoint: uncovered[0] };
    }
    return { kind: "stop", reason: "all anchors and checkpoints covered" };
  }

  const anchorAlreadyAsked = state.askedQuestions.some((q) =>
    sameNormalized(q, anchors[idx].question),
  );
  if (!anchorAlreadyAsked) {
    return { kind: "anchor", anchor: anchors[idx] };
  }

  if (
    state.followUpsOnCurrentAnchor < config.budget.maxFollowUpsPerAnchor &&
    (uncovered.length > 0 || state.unresolvedThreads.length > 0)
  ) {
    return { kind: "follow_up" };
  }

  return advanceAnchor(config, state);
}

function advanceAnchor(
  config: DynamicConfig,
  state: InterviewerState,
): Decision {
  const next = state.currentAnchorIndex + 1;
  if (next < config.anchors.length) {
    return { kind: "anchor", anchor: config.anchors[next] };
  }
  const uncovered = uncoveredCheckpoints(config, state);
  if (uncovered.length > 0) {
    return { kind: "force_checkpoint", checkpoint: uncovered[0] };
  }
  return { kind: "stop", reason: "interview complete" };
}

// ---------- Diversity ----------

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
}

function sameNormalized(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function trigramSet(s: string): Set<string> {
  const n = normalize(s);
  if (n.length < 3) return new Set([n]);
  const set = new Set<string>();
  for (let i = 0; i <= n.length - 3; i++) set.add(n.slice(i, i + 3));
  return set;
}

function jaccard(a: string, b: string): number {
  const sa = trigramSet(a);
  const sb = trigramSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tooSimilar(candidate: string, prior: string[]): boolean {
  return prior.some((p) => jaccard(candidate, p) >= 0.7);
}

// ---------- Unified LLM turn ----------

async function runInterviewerTurn(input: {
  config: DynamicConfig;
  state: InterviewerState;
  recent: { question: string; answer: string }[];
  lastQuestion: string;
  lastAnswer: string;
  hint: Decision;
  remainingBudget: number;
}): Promise<z.infer<typeof TurnOutSchema> | null> {
  const { config, state, recent, lastQuestion, lastAnswer, hint, remainingBudget } =
    input;

  const uncovered = uncoveredCheckpoints(config, state);

  const userMessage = JSON.stringify(
    {
      objective: config.objective,
      persona: config.persona ?? "warm, curious, concise",
      stopConditions: config.stopConditions,
      checkpoints: {
        all: config.checkpoints,
        coveredSoFar: state.covered.filter((c) => c.confidence >= 0.5),
        uncovered,
      },
      anchors: config.anchors,
      currentAnchorIndex: state.currentAnchorIndex,
      followUpsOnCurrentAnchor: state.followUpsOnCurrentAnchor,
      maxFollowUpsPerAnchor: config.budget.maxFollowUpsPerAnchor,
      unresolvedThreads: state.unresolvedThreads,
      questionsAsked: state.askedQuestions,
      remainingBudget,
      recentTranscript: recent,
      lastQuestion,
      lastAnswer,
      hint:
        hint.kind === "anchor"
          ? { mode: "ask_anchor", anchor: hint.anchor }
          : hint.kind === "force_checkpoint"
          ? { mode: "force_checkpoint", target: hint.checkpoint }
          : hint.kind === "follow_up"
          ? { mode: "follow_up" }
          : { mode: "end_recommended", reason: hint.reason },
    },
    null,
    2,
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await generateInterviewerTurnJson(
        attempt === 0
          ? userMessage
          : userMessage +
              "\n\nNOTE: previous attempt was too similar to a prior question. Produce a meaningfully different question.",
      );
    } catch {
      return null;
    }
    let parsed: z.infer<typeof TurnOutSchema>;
    try {
      parsed = TurnOutSchema.parse(JSON.parse(raw));
    } catch {
      continue;
    }
    if (parsed.action === "ask") {
      if (!parsed.question.trim()) continue;
      if (tooSimilar(parsed.question, state.askedQuestions)) continue;
    }
    return parsed;
  }
  return null;
}

// ---------- Public engine API ----------

export type EngineTurnResult =
  | {
      kind: "question";
      pending: PendingQuestion;
      state: InterviewerState;
      transcript: Turn[];
    }
  | {
      kind: "done";
      reason: string;
      reply?: string;
      state: InterviewerState;
      transcript: Turn[];
    };

export async function nextTurn(
  config: DynamicConfig,
  state: InterviewerState,
  transcript: Turn[],
  lastAnswer?: { questionId: string; answer: string },
): Promise<EngineTurnResult> {
  let nextState: InterviewerState = { ...state };
  let nextTranscript = transcript.slice();

  // Step 1: Pre-budget hard stop
  if (
    nextState.questionsAsked >= config.budget.maxQuestions ||
    nextState.shouldStop
  ) {
    return {
      kind: "done",
      reason: nextState.stopReason ?? "budget exhausted",
      state: nextState,
      transcript: nextTranscript,
    };
  }

  // Step 2: First call, no answer — ask the first anchor deterministically.
  if (!lastAnswer) {
    const first = config.anchors[0];
    const pending: PendingQuestion = {
      questionId: `a_${first.id}`,
      question: first.question,
      source: "anchor",
      anchorId: first.id,
      topicTag: "anchor",
    };
    nextState.pendingQuestion = pending;
    nextState.questionsAsked = 1;
    nextState.askedQuestions = [first.question];
    nextState.currentAnchorIndex = 0;
    nextTranscript.push({
      questionId: pending.questionId,
      question: pending.question,
      source: "anchor",
      anchorId: first.id,
      topicTag: "anchor",
      answer: "",
      askedAt: new Date().toISOString(),
    });
    return {
      kind: "question",
      pending,
      state: nextState,
      transcript: nextTranscript,
    };
  }

  // Step 3: Persist the answer to the pending question (if it matches).
  let lastQuestionText = "";
  if (nextState.pendingQuestion?.questionId === lastAnswer.questionId) {
    lastQuestionText = nextState.pendingQuestion.question;
    const idx = nextTranscript.findIndex(
      (t) => t.questionId === lastAnswer.questionId,
    );
    if (idx >= 0) {
      nextTranscript[idx] = {
        ...nextTranscript[idx],
        answer: lastAnswer.answer,
        answeredAt: new Date().toISOString(),
      };
    }
    nextState.pendingQuestion = null;
  } else {
    // stale; just record best-effort
    lastQuestionText =
      nextTranscript[nextTranscript.length - 1]?.question ?? "";
  }

  // Step 4: Compute hint for the LLM (helps it advance/stop reliably).
  const hint = decideHint(config, nextState);
  const remainingBudget =
    config.budget.maxQuestions - nextState.questionsAsked;

  // Step 5: Single unified LLM call.
  const recent = nextTranscript.slice(-5).map((t) => ({
    question: t.question,
    answer: t.answer,
  }));

  const out = await runInterviewerTurn({
    config,
    state: nextState,
    recent,
    lastQuestion: lastQuestionText,
    lastAnswer: lastAnswer.answer,
    hint,
    remainingBudget,
  });

  // Step 6: Apply coverage + threads from the LLM output (or fall back).
  if (out) {
    const byId = new Map(nextState.covered.map((c) => [c.checkpointId, c]));
    for (const c of out.covered) {
      if (c.confidence < 0.5) continue;
      const existing = byId.get(c.checkpointId);
      if (!existing || c.confidence > existing.confidence) {
        byId.set(c.checkpointId, c);
      }
    }
    nextState.covered = Array.from(byId.values());

    const threads = new Set(nextState.unresolvedThreads);
    for (const t of out.unresolvedThreads) threads.add(t);
    nextState.unresolvedThreads = Array.from(threads).slice(0, 8);
  }

  // Step 7: Honor the LLM's action, with hard-budget guard.
  const llmEnded = out?.action === "end";
  const reply = (out?.reply ?? "").trim();
  const hardStop = nextState.questionsAsked >= config.budget.maxQuestions;

  if (llmEnded || hardStop || hint.kind === "stop") {
    nextState.shouldStop = true;
    nextState.stopReason =
      out?.endReason || (hardStop ? "budget exhausted" : (hint.kind === "stop" ? hint.reason : "interview complete"));
    return {
      kind: "done",
      reason: nextState.stopReason!,
      reply: reply || undefined,
      state: nextState,
      transcript: nextTranscript,
    };
  }

  // Step 8: Build the next pending question.
  let pending: PendingQuestion | null = null;

  if (out && out.question.trim()) {
    // Track follow-up vs anchor advancement based on the hint's mode.
    if (hint.kind === "anchor") {
      const anchorIdx = config.anchors.findIndex(
        (x) => x.id === hint.anchor.id,
      );
      if (anchorIdx >= 0) nextState.currentAnchorIndex = anchorIdx;
      nextState.followUpsOnCurrentAnchor = 0;
    } else if (hint.kind === "follow_up") {
      nextState.followUpsOnCurrentAnchor += 1;
    }
    pending = {
      questionId: `t_${nextState.questionsAsked + 1}_${Date.now().toString(36)}`,
      question: out.question.trim(),
      source: hint.kind === "anchor" ? "anchor" : "ai",
      anchorId: hint.kind === "anchor" ? hint.anchor.id : undefined,
      topicTag: out.topicTag || (hint.kind === "force_checkpoint" ? hint.checkpoint.id : "general"),
      whyGenerated: out.whyGenerated || undefined,
      reply: reply || undefined,
    };
  } else {
    // Fallback path: LLM failed → use the deterministic hint.
    if (hint.kind === "anchor") {
      const a = hint.anchor;
      const anchorIdx = config.anchors.findIndex((x) => x.id === a.id);
      if (anchorIdx >= 0) nextState.currentAnchorIndex = anchorIdx;
      nextState.followUpsOnCurrentAnchor = 0;
      pending = {
        questionId: `a_${a.id}`,
        question: a.question,
        source: "anchor",
        anchorId: a.id,
        topicTag: "anchor",
      };
    } else {
      const adv = advanceAnchor(config, nextState);
      if (adv.kind === "anchor") {
        const a = adv.anchor;
        const anchorIdx = config.anchors.findIndex((x) => x.id === a.id);
        if (anchorIdx >= 0) nextState.currentAnchorIndex = anchorIdx;
        nextState.followUpsOnCurrentAnchor = 0;
        pending = {
          questionId: `a_${a.id}`,
          question: a.question,
          source: "anchor",
          anchorId: a.id,
          topicTag: "anchor",
        };
      } else {
        return {
          kind: "done",
          reason: "generation failed",
          state: nextState,
          transcript: nextTranscript,
        };
      }
    }
  }

  // Step 9: Record pending and append placeholder.
  nextState.pendingQuestion = pending;
  nextState.questionsAsked += 1;
  nextState.askedQuestions.push(pending.question);

  nextTranscript.push({
    questionId: pending.questionId,
    question: pending.question,
    source: pending.source,
    anchorId: pending.anchorId,
    topicTag: pending.topicTag,
    whyGenerated: pending.whyGenerated,
    reply: pending.reply,
    answer: "",
    askedAt: new Date().toISOString(),
  });

  return {
    kind: "question",
    pending,
    state: nextState,
    transcript: nextTranscript,
  };
}

// ---------- Helpers for callers ----------

export function loadConfigFromSurvey(
  survey: {
    objective: string | null;
    anchors: unknown;
    checkpoints: unknown;
    budget: unknown;
    stopConditions: unknown;
    persona: string | null;
  },
): DynamicConfig | null {
  if (!survey.objective) return null;
  const candidate = {
    objective: survey.objective,
    anchors: survey.anchors,
    checkpoints: survey.checkpoints ?? [],
    budget: survey.budget,
    stopConditions: survey.stopConditions ?? [],
    persona: survey.persona ?? undefined,
  };
  const parsed = DynamicConfigSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function loadStateOrInit(raw: unknown): InterviewerState {
  if (!raw || typeof raw !== "object") return initialState();
  const r = raw as Partial<InterviewerState>;
  return {
    currentAnchorIndex:
      typeof r.currentAnchorIndex === "number" ? r.currentAnchorIndex : 0,
    followUpsOnCurrentAnchor:
      typeof r.followUpsOnCurrentAnchor === "number"
        ? r.followUpsOnCurrentAnchor
        : 0,
    questionsAsked: typeof r.questionsAsked === "number" ? r.questionsAsked : 0,
    covered: Array.isArray(r.covered) ? r.covered : [],
    unresolvedThreads: Array.isArray(r.unresolvedThreads)
      ? r.unresolvedThreads
      : [],
    askedQuestions: Array.isArray(r.askedQuestions) ? r.askedQuestions : [],
    shouldStop: !!r.shouldStop,
    stopReason: typeof r.stopReason === "string" ? r.stopReason : null,
    pendingQuestion:
      r.pendingQuestion && typeof r.pendingQuestion === "object"
        ? (r.pendingQuestion as PendingQuestion)
        : null,
  };
}

export function loadTranscript(raw: unknown): Turn[] {
  return Array.isArray(raw) ? (raw as Turn[]) : [];
}
