/* @vitest-environment jsdom */

import { beforeEach, describe, expect, test, vi } from "vitest";

import { buildGlobalKeymap } from "./keymap";
import { defaultShortcutPreferences } from "./keybindings";
import { useModals } from "@/state/modalStore";
import { useUiPrefs } from "@/state/uiPrefsStore";

describe("buildGlobalKeymap", () => {
  beforeEach(() => {
    useUiPrefs.setState({ keybindings: defaultShortcutPreferences() });
  });

  test("registers the registry-derived chords for nav.inbox + its aliases", () => {
    const nav = { navigate: vi.fn<(to: string) => void>() };
    const map = buildGlobalKeymap(nav);

    expect(typeof map["g i"]).toBe("function");
    expect(typeof map["1"]).toBe("function");
    expect(typeof map.Digit1).toBe("function");
  });

  test("g a binds to archive (not analytics) after the migration", () => {
    const nav = { navigate: vi.fn<(to: string) => void>() };
    const map = buildGlobalKeymap(nav);

    map["g a"]?.(new KeyboardEvent("keydown"));
    expect(nav.navigate).toHaveBeenCalledWith("/mail/all/archive");
  });

  test("g y opens analytics", () => {
    const nav = { navigate: vi.fn<(to: string) => void>() };
    const map = buildGlobalKeymap(nav);

    map["g y"]?.(new KeyboardEvent("keydown"));
    expect(nav.navigate).toHaveBeenCalledWith("/analytics");
  });

  test("uses the configured global shortcut instead of the default chord", () => {
    const nav = { navigate: vi.fn<(to: string) => void>() };
    const preferences = {
      ...defaultShortcutPreferences(),
      "nav.archive": "g z",
    };
    useUiPrefs.setState({ keybindings: preferences });
    const map = buildGlobalKeymap(nav, preferences);

    expect(map["g z"]).toBeTypeOf("function");
    expect(map["g a"]).toBeUndefined();
    map["g z"]?.(new KeyboardEvent("keydown"));
    expect(nav.navigate).toHaveBeenCalledWith("/mail/all/archive");
  });

  test("Shift+Semicolon opens the command palette", () => {
    const nav = { navigate: vi.fn<(to: string) => void>() };
    const map = buildGlobalKeymap(nav);
    useModals.setState({ commandPaletteOpen: false });

    map["Shift+Semicolon"]?.(new KeyboardEvent("keydown"));
    expect(useModals.getState().commandPaletteOpen).toBe(true);
  });

  test("chord handlers no-op when typing in an input field", () => {
    const nav = { navigate: vi.fn<(to: string) => void>() };
    const map = buildGlobalKeymap(nav);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new KeyboardEvent("keydown");
    Object.defineProperty(event, "target", { value: input });

    map["g i"]?.(event);
    expect(nav.navigate).not.toHaveBeenCalled();
    input.remove();
  });

  test("chord handlers no-op inside dialogs and composer controls", () => {
    const nav = { navigate: vi.fn<(to: string) => void>() };
    const map = buildGlobalKeymap(nav);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const composerControl = document.createElement("button");
    composerControl.dataset.composer = "true";
    dialog.append(composerControl);
    document.body.append(dialog);
    const event = new KeyboardEvent("keydown");
    Object.defineProperty(event, "target", { value: composerControl });

    map["g i"]?.(event);
    expect(nav.navigate).not.toHaveBeenCalled();
    dialog.remove();
  });
});
