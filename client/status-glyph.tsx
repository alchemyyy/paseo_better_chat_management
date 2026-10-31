// Mirrors the sidebar's workspace status indicator (components/sidebar/sidebar-workspace-row-content.tsx)
// and running ring (components/status-ring/), drawn with plugin theme colors.
import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { memo, useLayoutEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { PaseoAgent } from "./fork";
import { spinForever } from "./web";

type Theme = PluginSidebarItemProps["theme"];
export type ChatStatus = "needs_input" | "running" | "failed" | "attention" | "idle";

// Geometry from components/status-ring/geometry.ts and utils/status-indicator-geometry.ts
const DOT_SIZE = 6;
const RING_GAP = 1.5;
const RING_STROKE = 1.5;
const RING_SIZE = DOT_SIZE + (RING_GAP + RING_STROKE) * 2;
const RING_TRACK_OPACITY = 0.3;
const RING_HEAD_OPACITY = 0.9;
const ALERT_SIZE = 12;
const IDLE_OPACITY = 0.3;

export function chatStatus(agent: PaseoAgent): ChatStatus {
  if (agent.pendingPermissions.length > 0 || agent.attentionReason === "permission") return "needs_input";
  if (agent.status === "running" || agent.status === "initializing") return "running";
  if (agent.status === "error" || agent.attentionReason === "error") return "failed";
  if (agent.requiresAttention) return "attention";
  return "idle";
}

const RunningRing = memo(function RunningRing({ color }: { color: string }) {
  const rotatorRef = useRef<View>(null);
  useLayoutEffect(() => spinForever(rotatorRef.current), []);
  return (
    <View style={styles.ringFrame}>
      <View style={[styles.circle, styles.track, { borderColor: color }]} />
      <View ref={rotatorRef} style={styles.rotator}>
        <View style={[styles.circle, { borderColor: "transparent", borderTopColor: color, opacity: RING_HEAD_OPACITY }]} />
      </View>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
});

/** The chat's status in the same marks a workspace row uses */
export const StatusGlyph = memo(function StatusGlyph({ status, theme }: { status: ChatStatus; theme: Theme }) {
  switch (status) {
    case "running":
      return <RunningRing color={theme.colors.accent} />;
    case "needs_input":
      return <Icon name="CircleAlert" size={ALERT_SIZE} color={theme.colors.statusWarning} />;
    case "failed":
      return <View style={[styles.dot, { backgroundColor: theme.colors.statusDanger }]} />;
    case "attention":
      return <View style={[styles.dot, { backgroundColor: theme.colors.statusSuccess }]} />;
    case "idle":
      return <View style={[styles.dot, { backgroundColor: theme.colors.foregroundMuted, opacity: IDLE_OPACITY }]} />;
  }
});

const styles = StyleSheet.create({
  ringFrame: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_STROKE,
  },
  track: {
    position: "absolute",
    opacity: RING_TRACK_OPACITY,
  },
  rotator: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
