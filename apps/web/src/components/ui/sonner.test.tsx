import { render } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { useUiPrefs } from "@/state/uiPrefsStore";

import { Toaster } from "./sonner";

describe("Toaster", () => {
  beforeEach(() => {
    useUiPrefs.setState((state) => ({
      ...state,
      toastPreferences: { ...state.toastPreferences, readState: false },
    }));
  });

  test("exposes disabled read-state confirmations to the rendered toast container", () => {
    const { container } = render(<Toaster />);

    expect(
      container.querySelector('[data-toast-preferences][data-show-read-state-toasts="false"]'),
    ).not.toBeNull();
  });
});
