// NOTE: The 0.13 plugin SDK cannot reach the sidebar's workspace rows, the tab strip, or the
// fork flow. This module reads React fibers to find the app's zustand stores and row handlers.
// It is app-internal and may break on a Paseo upgrade; every caller treats null as unavailable.

interface FiberLike {
  child: FiberLike | null;
  sibling: FiberLike | null;
  return: FiberLike | null;
  memoizedState?: unknown;
  memoizedProps?: Record<string, unknown> | null;
  stateNode?: { current?: FiberLike } | null;
}

interface HookLike {
  memoizedState?: unknown;
  next?: HookLike | null;
}

export interface StoreApi<State> {
  getState(): State;
  setState(partial: Partial<State>): void;
  subscribe(listener: () => void): () => void;
}

const FIBER_KEY_PREFIX = "__reactFiber$";
const CONTAINER_KEY_PREFIX = "__reactContainer$";
const MAX_HOOKS_PER_FIBER = 200;
const MAX_ANCESTOR_DEPTH = 60;

function readKeyed(node: unknown, prefix: string): FiberLike | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key.startsWith(prefix)) return record[key] as FiberLike;
  }
  return null;
}

function isStoreApi(value: unknown): value is StoreApi<unknown> {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.getState === "function" &&
    typeof candidate.setState === "function" &&
    typeof candidate.subscribe === "function"
  );
}

/**
 * Walks every fiber under a React root container and offers each zustand store held in hook
 * deps to `visit`. zustand 5 `useStore` keeps `useCallback(..., [api, selector])`, so any mounted
 * component that subscribes to a store exposes the store API there. Stop by returning true.
 */
export function scanStores(rootContainer: unknown, visit: (store: StoreApi<unknown>) => boolean): void {
  const containerFiber = readKeyed(rootContainer, CONTAINER_KEY_PREFIX);
  if (!containerFiber) return;
  // The container keeps the first HostRoot fiber; the FiberRoot knows the committed one
  const root = containerFiber.stateNode?.current ?? containerFiber;
  const seen = new Set<unknown>();
  const pending: FiberLike[] = [root];
  while (pending.length > 0) {
    const fiber = pending.pop()!;
    if (fiber.sibling) pending.push(fiber.sibling);
    if (fiber.child) pending.push(fiber.child);
    let hook = fiber.memoizedState as HookLike | null;
    for (let index = 0; hook && typeof hook === "object" && index < MAX_HOOKS_PER_FIBER; index++) {
      const memoized = hook.memoizedState;
      // useCallback/useMemo store [value, deps]
      if (Array.isArray(memoized) && memoized.length === 2 && Array.isArray(memoized[1])) {
        for (const dependency of memoized[1] as unknown[]) {
          if (seen.has(dependency) || !isStoreApi(dependency)) continue;
          seen.add(dependency);
          if (visit(dependency)) return;
        }
      }
      hook = hook.next ?? null;
    }
  }
}

/** The nearest component props above a host node that satisfy `accept`, or null */
export function findAncestorProps(
  node: unknown,
  accept: (props: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  let fiber = readKeyed(node, FIBER_KEY_PREFIX);
  for (let depth = 0; fiber && depth < MAX_ANCESTOR_DEPTH; depth++) {
    const props = fiber.memoizedProps;
    if (props && typeof props === "object" && accept(props)) return props;
    fiber = fiber.return;
  }
  return null;
}
