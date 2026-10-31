/** Label Paseo puts on agents launched by another agent (packages/protocol/src/agent-labels.ts) */
export const PARENT_AGENT_LABEL = "paseo.parent-agent-id";

export interface ChatAgent {
  id: string;
  title: string | null;
  createdAt: string;
  labels: Readonly<Record<string, string>>;
}

export interface ChatRow<Agent extends ChatAgent> {
  agent: Agent;
  depth: number;
}

function compareCreated(left: ChatAgent, right: ChatAgent): number {
  if (left.createdAt === right.createdAt) return left.id < right.id ? -1 : 1;
  return left.createdAt < right.createdAt ? -1 : 1;
}

/**
 * Flattens one workspace's chats into indented rows: forks under the chat they were forked from,
 * agent-launched chats under their launcher, siblings oldest first. A parent outside `agents`
 * (archived, other workspace) makes the chat a root.
 */
export function buildChatRows<Agent extends ChatAgent>(
  agents: readonly Agent[],
  forkParents: Readonly<Record<string, string>>,
): ChatRow<Agent>[] {
  const byId = new Map<string, Agent>();
  for (const agent of agents) byId.set(agent.id, agent);

  const childrenByParent = new Map<string, Agent[]>();
  const roots: Agent[] = [];
  for (const agent of agents) {
    const parentId = forkParents[agent.id] ?? agent.labels[PARENT_AGENT_LABEL];
    if (!parentId || parentId === agent.id || !byId.has(parentId)) {
      roots.push(agent);
      continue;
    }
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(agent);
    childrenByParent.set(parentId, siblings);
  }
  roots.sort(compareCreated);
  for (const siblings of childrenByParent.values()) siblings.sort(compareCreated);

  const rows: ChatRow<Agent>[] = [];
  const visited = new Set<string>();
  const emit = (start: Agent) => {
    const pending: ChatRow<Agent>[] = [{ agent: start, depth: 0 }];
    while (pending.length > 0) {
      const row = pending.pop()!;
      if (visited.has(row.agent.id)) continue;
      visited.add(row.agent.id);
      rows.push(row);
      const children = childrenByParent.get(row.agent.id) ?? [];
      // Reverse push keeps siblings oldest first when popped
      for (let index = children.length - 1; index >= 0; index--) {
        pending.push({ agent: children[index], depth: row.depth + 1 });
      }
    }
  };
  for (const root of roots) emit(root);
  // A parent cycle has no root; show its members flat rather than dropping them
  for (const agent of [...agents].sort(compareCreated)) {
    if (!visited.has(agent.id)) emit(agent);
  }
  return rows;
}
