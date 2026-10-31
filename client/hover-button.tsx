import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { forwardRef, useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

type Theme = PluginSidebarItemProps["theme"];

const BUTTON_SIZE = 22;
const ICON_SIZE = 14;
const HOVER_TINT = 0.1;
const PRESSED_TINT = 0.18;

interface HoverIconButtonProps {
  icon: string;
  theme: Theme;
  accessibilityLabel: string;
  onPress(): void;
  /** Keeps the highlight on, such as while the button's menu is open */
  active?: boolean;
  disabled?: boolean;
  /** Extra Pressable props, such as web-only `onContextMenu` */
  pressableProps?: object;
}

/**
 * An icon button with a hover and press highlight. Hover follows docs/hover.md: a plain View
 * owns pointer enter and leave, and a separate inner Pressable owns the press.
 */
export const HoverIconButton = forwardRef<View, HoverIconButtonProps>(function HoverIconButton(
  { icon, theme, accessibilityLabel, onPress, active = false, disabled = false, pressableProps },
  ref,
) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const handleEnter = useCallback(() => setHovered(true), []);
  const handleLeave = useCallback(() => {
    setHovered(false);
    setPressed(false);
  }, []);
  const handlePressIn = useCallback(() => setPressed(true), []);
  const handlePressOut = useCallback(() => setPressed(false), []);

  // A foreground tint stays one step lighter than whatever row background sits behind it,
  // including the selected row's
  let tintOpacity = 0;
  if (pressed) tintOpacity = PRESSED_TINT;
  else if (hovered || active) tintOpacity = HOVER_TINT;
  const highlighted = (hovered || pressed || active) && !disabled;

  return (
    <View
      ref={ref}
      style={[styles.frame, disabled ? styles.disabled : null]}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      {tintOpacity > 0 && !disabled ? (
        <View
          pointerEvents="none"
          style={[styles.tint, { backgroundColor: theme.colors.foreground, opacity: tintOpacity }]}
        />
      ) : null}
      <Pressable
        style={styles.press}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        {...pressableProps}
      >
        <Icon name={icon} size={ICON_SIZE} color={highlighted ? theme.colors.foreground : theme.colors.foregroundMuted} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 6,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  press: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  disabled: {
    opacity: 0.4,
  },
});
