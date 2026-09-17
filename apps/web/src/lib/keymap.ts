/*
 * Global keymap built from the action registry. Page-level chords (j/k, x,
 * etc.) are handled by per-page components — this only binds chords that the
 * registry exposes as non-paletteOnly actions.
 *
 * Inline-only chords (alt-bindings like Shift+Semicolon for the command
 * palette) live below the registry-derived map. The compose route disables
 * the keymap; the editor handles its own keys.
 */

import type { KeyBindingMap } from "tinykeys";

import { getRegistry, setRuntimeNavigate } from "@/lib/actions";
import type { ActionContext } from "@/lib/actions";
import type { ActionScope } from "@/lib/actions/types";
import { hasMailThread } from "@/features/mailbox/location";
import {
  getEffectiveActionShortcuts,
  hasShortcutInScope,
  isShortcutSuppressed,
  type ShortcutPreferences,
} from "@/lib/keybindings";
import { useKeyScope } from "@/state/keyScopeStore";
import { useMailboxPane } from "@/state/mailboxPaneStore";
import { useSelection } from "@/state/selectionStore";
import { useUiPrefs } from "@/state/uiPrefsStore";

interface Navigator {
  navigate: (to: string) => void;
}

function buildContextSnapshot(): ActionContext {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  return {
    path,
    activePane: useMailboxPane.getState().activePane,
    selectionCount: useSelection.getState().ids.size,
    accountCount: 0,
    hasFocusedThread: hasMailThread(path),
    hasFocusedMessage: false,
    isFirstAccountOnly: false,
  };
}

export function buildGlobalKeymap(
  nav: Navigator,
  preferences: ShortcutPreferences = useUiPrefs.getState().keybindings,
): KeyBindingMap {
  setRuntimeNavigate(nav);
  const reg = getRegistry();
  const map: KeyBindingMap = {};
  const bindings = new Map<string, Partial<Record<ActionScope, string>>>();
  for (const action of reg.all()) {
    if (action.paletteOnly || action.displayOnly) continue;
    const scope = action.scope ?? "global";
    for (const shortcut of getEffectiveActionShortcuts(action, preferences)) {
      const byScope = bindings.get(shortcut) ?? {};
      if (byScope[scope] && byScope[scope] !== action.id) continue;
      byScope[scope] = action.id;
      bindings.set(shortcut, byScope);
    }
  }
  for (const [chord, byScope] of bindings) {
    map[chord] = (e) => {
      // A page component that already handled (and preventDefault-ed) this
      // key wins over the global binding.
      if (e.defaultPrevented) return;
      if (isShortcutSuppressed(e)) return;
      // Resolve at dispatch time: active scope first, then global fallback.
      const scope = useKeyScope.getState().activeScope();
      if (scope === "mailbox" && hasShortcutInScope(chord, scope, preferences)) return;
      const actionId = byScope[scope] ?? byScope.global;
      const action = actionId ? reg.get(actionId) : undefined;
      if (!action) return;
      e.preventDefault();
      void action.run(buildContextSnapshot());
    };
  }
  return map;
}
