/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Switch } from "./switch";

describe("Switch", () => {
  test("keeps a readable track and thumb across both states", () => {
    render(<Switch aria-label="Enable feature" />);

    const control = screen.getByRole("switch", { name: "Enable feature" });
    const thumb = control.firstElementChild;

    expect(control).toHaveAttribute("data-state", "unchecked");
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(control).toHaveAttribute("data-slot", "switch");
    expect(control).toHaveClass("settings-switch", "h-6", "w-11", "border-2");
    expect(thumb).toHaveClass("size-4");
    expect(thumb).toHaveAttribute("data-slot", "switch-thumb");

    fireEvent.click(control);

    expect(control).toHaveAttribute("data-state", "checked");
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(thumb).toHaveClass("data-[state=checked]:translate-x-5");
  });
});
