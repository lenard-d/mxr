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
    expect(control).toHaveClass(
      "h-5",
      "w-9",
      "border-destructive",
      "bg-destructive/25",
      "disabled:saturate-50",
    );
    expect(thumb).toHaveClass("size-4");

    fireEvent.click(control);

    expect(control).toHaveAttribute("data-state", "checked");
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(control).toHaveClass(
      "data-[state=checked]:border-success",
      "data-[state=checked]:bg-success/80",
    );
  });
});
