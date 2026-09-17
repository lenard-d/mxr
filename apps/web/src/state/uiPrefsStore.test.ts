/* @vitest-environment jsdom */

import { beforeEach, describe, expect, test } from "vitest";

import { defaultToastPreferences, useUiPrefs } from "./uiPrefsStore";

describe("toast preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUiPrefs.setState({ toastPreferences: { ...defaultToastPreferences } });
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
});
