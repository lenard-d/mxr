/* @vitest-environment jsdom */

import { beforeEach, describe, expect, test } from "vitest";

import { defaultToastPreferences, useUiPrefs } from "./uiPrefsStore";
import { defaultShortcutPreferences } from "@/lib/keybindings";

describe("toast preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiPrefs.setState({
      toastPreferences: { ...defaultToastPreferences },
      keybindings: defaultShortcutPreferences(),
    });
  });

  test("updates one category without changing the others", () => {
    useUiPrefs.getState().setToastPreference("undo", false);

    expect(useUiPrefs.getState().toastPreferences).toEqual({
      ...defaultToastPreferences,
      undo: false,
    });
  });

  test("rehydrates valid values and ignores malformed category values", async () => {
    window.localStorage.setItem(
      "mxr.uiPrefs",
      JSON.stringify({
        state: { toastPreferences: { errors: false, sent: "no", unknown: false } },
        version: 2,
      }),
    );

    await useUiPrefs.persist.rehydrate();

    expect(useUiPrefs.getState().toastPreferences).toEqual({
      ...defaultToastPreferences,
      errors: false,
    });
  });

  test("rehydrates shortcut overrides but rejects malformed or colliding values", async () => {
    window.localStorage.setItem(
      "mxr.uiPrefs",
      JSON.stringify({
        state: {
          keybindings: {
            "mailbox.move-next": "not-a-key",
            "mailbox.archive": "j",
            "shell.compose": "g i",
          },
        },
        version: 2,
      }),
    );

    await useUiPrefs.persist.rehydrate();

    expect(useUiPrefs.getState().keybindings["mailbox.move-next"]).toBe("j");
    expect(useUiPrefs.getState().keybindings["mailbox.archive"]).toBe("e");
    expect(useUiPrefs.getState().keybindings["shell.compose"]).toBe("KeyC");
  });
});
