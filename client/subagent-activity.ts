/** What activity tracking reads of a provider subagent (protocol ProviderSubagentDescriptorPayload) */
export interface SubagentDescriptor {
  id: string;
  parentAgentId: string;
  status: string;
}

/** Parent chat id -> ids of its provider subagents still running */
export type RunningSubagents = ReadonlyMap<string, ReadonlySet<string>>;

export const NO_RUNNING_SUBAGENTS: RunningSubagents = new Map();

function withParent(state: RunningSubagents, parentAgentId: string, ids: ReadonlySet<string>): RunningSubagents {
  const next = new Map(state);
  if (ids.size > 0) next.set(parentAgentId, ids);
  else next.delete(parentAgentId);
  return next;
}

/** A subagent's new descriptor; returns `state` itself when nothing changed */
export function applySubagentUpsert(state: RunningSubagents, subagent: SubagentDescriptor): RunningSubagents {
  const ids = state.get(subagent.parentAgentId);
  const running = subagent.status === "running";
  if (running === (ids?.has(subagent.id) ?? false)) return state;
  const next = new Set(ids);
  if (running) next.add(subagent.id);
  else next.delete(subagent.id);
  return withParent(state, subagent.parentAgentId, next);
}

export function applySubagentRemove(state: RunningSubagents, parentAgentId: string, subagentId: string): RunningSubagents {
  const ids = state.get(parentAgentId);
  if (!ids?.has(subagentId)) return state;
  const next = new Set(ids);
  next.delete(subagentId);
  return withParent(state, parentAgentId, next);
}

/** A parent's full subagent list, as a resync after a reconnect returns it */
export function replaceParentSubagents(
  state: RunningSubagents,
  parentAgentId: string,
  subagents: readonly SubagentDescriptor[],
): RunningSubagents {
  const next = new Set(subagents.filter((subagent) => subagent.status === "running").map((subagent) => subagent.id));
  const ids = state.get(parentAgentId);
  if (next.size === (ids?.size ?? 0) && [...next].every((id) => ids?.has(id))) return state;
  return withParent(state, parentAgentId, next);
}
