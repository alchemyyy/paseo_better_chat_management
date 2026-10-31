// Mirrors the app's compact relative time (packages/app/src/utils/time.ts describeCompactTimeAgo)

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** Past a week the elapsed count stops meaning anything; the date itself is more use */
const ABSOLUTE_AFTER_MS = 7 * DAY_MS;

/** "now", "5m", "2h", "3d", "Jan 15" */
export function compactTimeAgo(date: Date, now: Date): string {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < MINUTE_MS) return "now";
  if (elapsedMs < HOUR_MS) return `${Math.floor(elapsedMs / MINUTE_MS)}m`;
  if (elapsedMs < DAY_MS) return `${Math.floor(elapsedMs / HOUR_MS)}h`;
  if (elapsedMs < ABSOLUTE_AFTER_MS) return `${Math.floor(elapsedMs / DAY_MS)}d`;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${month} ${date.getDate()}`;
}

/** The last time you or the chat did something: your last message, or its last finish or ask */
export function lastInteractionAt(agent: {
  lastUserMessageAt: string | null;
  attentionTimestamp?: string | null;
  createdAt: string;
}): Date {
  let latest = Date.parse(agent.createdAt);
  for (const value of [agent.lastUserMessageAt, agent.attentionTimestamp]) {
    const time = value ? Date.parse(value) : Number.NaN;
    if (Number.isFinite(time) && (!Number.isFinite(latest) || time > latest)) latest = time;
  }
  return new Date(latest);
}
