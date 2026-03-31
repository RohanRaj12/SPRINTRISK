/**
 * Sprint Guardian — Memory Service
 *
 * Implements the learning system with two tiers:
 *
 * Short-term memory: Per-run context that helps the agent
 *   maintain coherence across steps within a single execution.
 *
 * Long-term memory: Cross-run patterns and outcomes that
 *   improve the agent's decision-making over time.
 *
 * Stored patterns include:
 * - Successful resolution strategies
 * - Common failure modes and workarounds
 * - Organization-specific preferences
 * - Correlation patterns (e.g., "CI fail + stale ticket = blocked")
 */

import { randomUUID } from "node:crypto";
import type { MemoryEntry, MemoryType } from "../agent/types.js";

// ── In-memory store (replace with PostgreSQL in production) ──

const memoryStore = new Map<string, MemoryEntry>();

// ── Helper ──

function generateId(): string {
  return `mem_${randomUUID()}`;
}

// ── Memory Creation ──

export interface CreateMemoryInput {
  orgId: string;
  type: MemoryType;
  key: string;
  content: string;
  sourceRunId?: string;
  confidence?: number; // 0.0 - 1.0, default 0.5
  ttlHours?: number; // Optional expiration
}

/**
 * Store a new memory entry.
 * If a memory with the same key+orgId exists, it updates the existing one
 * and boosts its confidence.
 */
export function storeMemory(input: CreateMemoryInput): MemoryEntry {
  // Check for existing memory with same key
  const existing = findMemoryByKey(input.orgId, input.key);

  if (existing) {
    // Boost confidence (diminishing returns)
    const newConfidence = Math.min(
      1.0,
      existing.confidence + (1 - existing.confidence) * 0.2
    );

    const updated: MemoryEntry = {
      ...existing,
      content: input.content, // Update with latest observation
      confidence: newConfidence,
      usageCount: existing.usageCount + 1,
      sourceRunId: input.sourceRunId ?? existing.sourceRunId,
    };

    memoryStore.set(existing.id, updated);

    console.log(
      `[Memory] Updated "${input.key}" for org ${input.orgId} ` +
      `(confidence: ${existing.confidence.toFixed(2)} → ${newConfidence.toFixed(2)})`
    );

    return updated;
  }

  // Create new memory
  const memory: MemoryEntry = {
    id: generateId(),
    orgId: input.orgId,
    type: input.type,
    key: input.key,
    content: input.content,
    sourceRunId: input.sourceRunId,
    confidence: input.confidence ?? 0.5,
    usageCount: 0,
    createdAt: new Date(),
  };

  memoryStore.set(memory.id, memory);

  console.log(
    `[Memory] Stored new "${input.type}" memory: "${input.key}" ` +
    `for org ${input.orgId} (confidence: ${memory.confidence.toFixed(2)})`
  );

  return memory;
}

// ── Memory Retrieval ──

/**
 * Find memories relevant to a given context.
 * Returns memories sorted by relevance (confidence × recency).
 */
export function retrieveRelevantMemories(
  orgId: string,
  context: {
    actionTypes?: string[];
    keywords?: string[];
    types?: MemoryType[];
  },
  limit: number = 10
): MemoryEntry[] {
  const candidates: Array<{ memory: MemoryEntry; score: number }> = [];

  for (const memory of memoryStore.values()) {
    if (memory.orgId !== orgId) continue;

    // Check type filter
    if (context.types && !context.types.includes(memory.type)) continue;

    // Calculate relevance score
    let score = memory.confidence;

    // Boost by keyword matches
    if (context.keywords) {
      const matchCount = context.keywords.filter(
        (kw) =>
          memory.key.toLowerCase().includes(kw.toLowerCase()) ||
          memory.content.toLowerCase().includes(kw.toLowerCase())
      ).length;
      score += matchCount * 0.1;
    }

    // Boost by action type matches
    if (context.actionTypes) {
      const actionMatch = context.actionTypes.some(
        (at) =>
          memory.key.includes(at) || memory.content.includes(at)
      );
      if (actionMatch) score += 0.2;
    }

    // Recency boost (memories used recently are more relevant)
    if (memory.lastUsedAt) {
      const daysSinceUse =
        (Date.now() - memory.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUse < 1) score += 0.15;
      else if (daysSinceUse < 7) score += 0.1;
      else if (daysSinceUse < 30) score += 0.05;
    }

    // Usage frequency boost
    score += Math.min(memory.usageCount * 0.02, 0.2);

    candidates.push({ memory, score });
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Mark returned memories as "used"
  const results = candidates.slice(0, limit).map((c) => {
    c.memory.usageCount++;
    c.memory.lastUsedAt = new Date();
    memoryStore.set(c.memory.id, c.memory);
    return c.memory;
  });

  return results;
}

/**
 * Find a specific memory by key and org.
 */
function findMemoryByKey(
  orgId: string,
  key: string
): MemoryEntry | undefined {
  for (const memory of memoryStore.values()) {
    if (memory.orgId === orgId && memory.key === key) {
      return memory;
    }
  }
  return undefined;
}

// ── Learning Functions ──

/**
 * Learn from a completed agent run.
 * Extracts patterns and outcomes to store as long-term memories.
 */
export function learnFromRun(
  orgId: string,
  runId: string,
  input: {
    observations: Record<string, unknown>;
    diagnosis: string;
    stepsExecuted: Array<{
      actionType: string;
      success: boolean;
      result?: unknown;
      errorMessage?: string;
    }>;
    overallSuccess: boolean;
  }
): MemoryEntry[] {
  const newMemories: MemoryEntry[] = [];

  // Store overall outcome
  newMemories.push(
    storeMemory({
      orgId,
      type: "outcome",
      key: `run_outcome:${input.diagnosis.substring(0, 50)}`,
      content: JSON.stringify({
        diagnosis: input.diagnosis,
        success: input.overallSuccess,
        stepsCount: input.stepsExecuted.length,
        failedSteps: input.stepsExecuted.filter((s) => !s.success).length,
      }),
      sourceRunId: runId,
      confidence: input.overallSuccess ? 0.7 : 0.5,
    })
  );

  // Learn from individual step outcomes
  for (const step of input.stepsExecuted) {
    const key = `step_outcome:${step.actionType}:${step.success ? "success" : "failure"}`;
    const content = step.success
      ? `Action "${step.actionType}" completed successfully.`
      : `Action "${step.actionType}" failed: ${step.errorMessage || "unknown error"}`;

    newMemories.push(
      storeMemory({
        orgId,
        type: "outcome",
        key,
        content,
        sourceRunId: runId,
        confidence: 0.6,
      })
    );
  }

  // Detect patterns: if multiple failures of same type, store as pattern
  const failuresByType = new Map<string, number>();
  for (const step of input.stepsExecuted) {
    if (!step.success) {
      failuresByType.set(
        step.actionType,
        (failuresByType.get(step.actionType) ?? 0) + 1
      );
    }
  }

  for (const [actionType, count] of failuresByType) {
    if (count >= 2) {
      newMemories.push(
        storeMemory({
          orgId,
          type: "pattern",
          key: `recurring_failure:${actionType}`,
          content: `Action "${actionType}" has failed ${count} times in a single run. May indicate a systemic issue.`,
          sourceRunId: runId,
          confidence: 0.8,
        })
      );
    }
  }

  console.log(
    `[Memory] Learned ${newMemories.length} entries from run ${runId}`
  );

  return newMemories;
}

/**
 * Get memory statistics for an organization.
 */
export function getMemoryStats(orgId: string): {
  total: number;
  byType: Record<MemoryType, number>;
  avgConfidence: number;
} {
  let total = 0;
  let confidenceSum = 0;
  const byType: Record<string, number> = {
    pattern: 0,
    outcome: 0,
    preference: 0,
    context: 0,
  };

  for (const memory of memoryStore.values()) {
    if (memory.orgId !== orgId) continue;
    total++;
    confidenceSum += memory.confidence;
    byType[memory.type] = (byType[memory.type] ?? 0) + 1;
  }

  return {
    total,
    byType: byType as Record<MemoryType, number>,
    avgConfidence: total > 0 ? confidenceSum / total : 0,
  };
}
