// Workspaces whose chat list is collapsed in the sidebar, by workspace key, kept across reloads.
import { readStorage, writeStorage } from "./web";

const STORAGE_KEY = "better-chat-management:collapsed-workspaces";

function load(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(readStorage(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

let collapsed = load();
const listeners = new Set<() => void>();

export function subscribeCollapsed(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The same set until a toggle, so it can feed useSyncExternalStore */
export function getCollapsed(): ReadonlySet<string> {
  return collapsed;
}

export function toggleCollapsed(workspaceKey: string): void {
  const next = new Set(collapsed);
  if (!next.delete(workspaceKey)) next.add(workspaceKey);
  collapsed = next;
  writeStorage(STORAGE_KEY, JSON.stringify([...next]));
  for (const listener of listeners) listener();
}
