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
  /** The row this one nests under, or null at the top level */
  parentId: string | null;
}

function compareCreated(left: ChatAgent, right: ChatAgent): number {
  if (left.createdAt === right.createdAt) return left.id < right.id ? -1 : 1;
  return left.createdAt < right.createdAt ? -1 : 1;
}

/** Siblings in the dragged order first, the rest after them oldest first */
function compareOrdered(rank: ReadonlyMap<string, number>): (left: ChatAgent, right: ChatAgent) => number {
  return (left, right) => {
    const leftRank = rank.get(left.id);
    const rightRank = rank.get(right.id);
    if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
    if (leftRank !== undefined) return -1;
    if (rightRank !== undefined) return 1;
    return compareCreated(left, right);
  };
}

/**
 * Flattens one workspace's chats into indented rows: forks under the chat they were forked from,
 * agent-launched chats under their launcher, siblings in `order` (chat ids as dragged) and the
 * rest oldest first. A parent outside `agents` (archived, other workspace) makes the chat a root.
 */
export function buildChatRows<Agent extends ChatAgent>(
  agents: readonly Agent[],
  forkParents: Readonly<Record<string, string>>,
  order: readonly string[] = [],
): ChatRow<Agent>[] {
  const byId = new Map<string, Agent>();
  for (const agent of agents) byId.set(agent.id, agent);
  const rank = new Map(order.map((id, index) => [id, index]));
  const compare = compareOrdered(rank);

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
  roots.sort(compare);
  for (const siblings of childrenByParent.values()) siblings.sort(compare);

  const rows: ChatRow<Agent>[] = [];
  const visited = new Set<string>();
  const emit = (start: Agent) => {
    const pending: ChatRow<Agent>[] = [{ agent: start, depth: 0, parentId: null }];
    while (pending.length > 0) {
      const row = pending.pop()!;
      if (visited.has(row.agent.id)) continue;
      visited.add(row.agent.id);
      rows.push(row);
      const children = childrenByParent.get(row.agent.id) ?? [];
      // Reverse push keeps siblings in order when popped
      for (let index = children.length - 1; index >= 0; index--) {
        pending.push({ agent: children[index], depth: row.depth + 1, parentId: row.agent.id });
      }
    }
  };
  for (const root of roots) emit(root);
  // A parent cycle has no root; show its members flat rather than dropping them
  for (const agent of [...agents].sort(compare)) {
    if (!visited.has(agent.id)) emit(agent);
  }
  return rows;
}
