/* @vitest-environment jsdom */

import { beforeEach, describe, expect, test } from "vitest";

import {
  DEFAULT_SIDEBAR_WIDTH,
  DEFAULT_THREAD_SPLIT_RATIO,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  THREAD_SPLIT_RATIO_MAX,
  THREAD_SPLIT_RATIO_MIN,
  defaultSidebarVisibility,
  defaultToastPreferences,
  useUiPrefs,
} from "./uiPrefsStore";
import { defaultShortcutPreferences } from "@/lib/keybindings";

describe("toast preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiPrefs.setState({
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      threadSplitRatio: DEFAULT_THREAD_SPLIT_RATIO,
      sidebarVisibility: { ...defaultSidebarVisibility },
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

  test("stores a dedicated preference for read-state confirmations", () => {
    useUiPrefs.getState().setToastPreference("readState", false);

    expect(useUiPrefs.getState().toastPreferences.readState).toBe(false);
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

describe("desktop layout and sidebar preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiPrefs.setState({
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      threadSplitRatio: DEFAULT_THREAD_SPLIT_RATIO,
      sidebarVisibility: { ...defaultSidebarVisibility },
    });
  });

  test("clamps resizable layout values and updates feature visibility", () => {
    useUiPrefs.getState().setSidebarWidth(SIDEBAR_WIDTH_MIN - 1);
    useUiPrefs.getState().setThreadSplitRatio(THREAD_SPLIT_RATIO_MAX + 1);
    useUiPrefs.getState().setSidebarItemVisible("reply-queue", false);

    expect(useUiPrefs.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MIN);
    expect(useUiPrefs.getState().threadSplitRatio).toBe(THREAD_SPLIT_RATIO_MAX);
    expect(useUiPrefs.getState().sidebarVisibility["reply-queue"]).toBe(false);
    expect(useUiPrefs.getState().sidebarVisibility.drafts).toBe(true);
  });

  test("sanitizes persisted layout values and fills missing visibility defaults", async () => {
    window.localStorage.setItem(
      "mxr.uiPrefs",
      JSON.stringify({
        state: {
          sidebarWidth: SIDEBAR_WIDTH_MAX + 40,
          threadSplitRatio: THREAD_SPLIT_RATIO_MIN - 0.1,
          sidebarVisibility: { "reply-queue": false, drafts: "no" },
        },
        version: 2,
      }),
    );

    await useUiPrefs.persist.rehydrate();

    expect(useUiPrefs.getState().sidebarWidth).toBe(SIDEBAR_WIDTH_MAX);
    expect(useUiPrefs.getState().threadSplitRatio).toBe(THREAD_SPLIT_RATIO_MIN);
    expect(useUiPrefs.getState().sidebarVisibility).toEqual({
      ...defaultSidebarVisibility,
      "reply-queue": false,
    });
  });
});
