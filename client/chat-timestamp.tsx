import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { memo, useSyncExternalStore } from "react";
import { StyleSheet, Text } from "react-native";
import { compactTimeAgo } from "./time";

type Theme = PluginSidebarItemProps["theme"];

const CLOCK_TICK_MS = 30_000;
const clockListeners = new Set<() => void>();
let clockNow = Date.now();
let clockTimer: ReturnType<typeof setInterval> | null = null;

/** One shared ticker for every chat timestamp; it runs only while one is mounted */
function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const notify of clockListeners) notify();
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** Its own component so the minute tick re-renders one Text, not the row */
export const ChatTimestamp = memo(function ChatTimestamp({ at, theme }: { at: Date; theme: Theme }) {
  const now = useSyncExternalStore(subscribeClock, () => clockNow);
  return (
    <Text style={[styles.timestamp, { color: theme.colors.foregroundMuted }]} numberOfLines={1} selectable={false}>
      {compactTimeAgo(at, new Date(Math.max(now, Date.now())))}
    </Text>
  );
});

const styles = StyleSheet.create({
  // Quieter than the title, as the workspace row's timestamp is
  timestamp: {
    flexShrink: 0,
    marginLeft: 6,
    fontSize: 12,
    opacity: 0.75,
  },
});
