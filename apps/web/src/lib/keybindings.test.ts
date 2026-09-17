/* @vitest-environment jsdom */

import { describe, expect, test } from "vitest";

import {
  DEFAULT_SHORTCUT_PREFERENCES,
  formatShortcutForDisplay,
  isShortcutSuppressed,
  matchesShortcutToken,
  sanitizeShortcutPreferences,
  validateShortcutValue,
} from "./keybindings";

describe("shortcut preferences", () => {
  test("normalizes and displays Gmail-style sequences", () => {
    expect(formatShortcutForDisplay("g g")).toBe("gg");
    expect(formatShortcutForDisplay("* a")).toBe("*a");
    expect(formatShortcutForDisplay("Shift+g")).toBe("G");
  });

  test("rejects invalid and duplicate values instead of shadowing another action", () => {
    const duplicate = validateShortcutValue(
      "mailbox.archive",
      "j",
      DEFAULT_SHORTCUT_PREFERENCES,
    );
    expect(duplicate.valid).toBe(false);
    expect(duplicate.error).toMatch(/move to next/i);

    const invalid = validateShortcutValue(
      "mailbox.archive",
      "not-a-real-key",
      DEFAULT_SHORTCUT_PREFERENCES,
    );
    expect(invalid.valid).toBe(false);
  });

  test("rejects prefix collisions in the same scope", () => {
    const result = validateShortcutValue(
      "mailbox.archive",
      "g",
      DEFAULT_SHORTCUT_PREFERENCES,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/sequence|prefix/i);
  });

  test("sanitizes malformed persisted values back to safe defaults", () => {
    const sanitized = sanitizeShortcutPreferences({
      "mailbox.move-next": "not-a-real-key",
      "mailbox.move-previous": "j",
      "shell.compose": "g i",
      "mailbox.archive": null,
      unknown: "x",
    });

    expect(sanitized["mailbox.move-next"]).toBe("j");
    expect(sanitized["mailbox.move-previous"]).toBe("k");
    expect(sanitized["shell.compose"]).toBe("KeyC");
    expect(sanitized["mailbox.archive"]).toBeNull();
  });

  test("matches modifier and special-key tokens against keyboard events", () => {
    const next = new KeyboardEvent("keydown", { key: "j" });
    const bottom = new KeyboardEvent("keydown", { key: "G", shiftKey: true });
    const selectAll = new KeyboardEvent("keydown", { key: "a", ctrlKey: true });
    const trash = new KeyboardEvent("keydown", { key: "#", shiftKey: true });

    expect(matchesShortcutToken(next, "j")).toBe(true);
    expect(matchesShortcutToken(bottom, "Shift+g")).toBe(true);
    expect(matchesShortcutToken(selectAll, "$mod+KeyA")).toBe(true);
    expect(matchesShortcutToken(trash, "#")).toBe(true);
  });

  test("suppresses shortcuts in controls, dialogs, and composers", () => {
    const input = document.createElement("input");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const composer = document.createElement("button");
    composer.dataset.composer = "true";
    dialog.append(input, composer);
    document.body.append(dialog);

    expect(isShortcutSuppressed({ target: input })).toBe(true);
    expect(isShortcutSuppressed({ target: dialog })).toBe(true);
    expect(isShortcutSuppressed({ target: composer })).toBe(true);

    dialog.remove();
  });
});
