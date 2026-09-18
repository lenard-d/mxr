/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BulkActionBar } from "./BulkActionBar";
import { useSelection } from "@/state/selectionStore";

const mutation = vi.hoisted(() => ({
  mutate: vi.fn<(ids: string[]) => void>(),
  isPending: false,
}));

vi.mock("./useOptimisticMailMutation", () => ({
  useOptimisticMailMutation: () => mutation,
}));

vi.mock("./SnoozeDialog", () => ({
  SnoozeDialog: () => null,
}));

describe("BulkActionBar", () => {
  beforeEach(() => {
    useSelection.getState().selectMany(["msg-1", "msg-2"]);
  });

  afterEach(() => {
    useSelection.getState().clear();
    vi.clearAllMocks();
  });

  test("asks for confirmation before bulk trashing selected messages", () => {
    render(<BulkActionBar />);

    fireEvent.click(screen.getByRole("button", { name: /^trash$/i }));

    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /trash 2 messages/i })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /confirm trash/i }));

    expect(mutation.mutate).toHaveBeenCalledWith(["msg-1", "msg-2"]);
  });

  test("shows refresh beside select until a selection replaces it with actions", () => {
    const onRefresh = vi.fn<() => void>();
    useSelection.getState().clear();

    const { rerender } = render(
      <BulkActionBar rows={[]} onRefresh={onRefresh} trailing={<span>Filters</span>} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fetch new mail" }));
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Filters")).toBeVisible();

    useSelection.getState().selectMany(["msg-1"]);
    rerender(<BulkActionBar onRefresh={onRefresh} trailing={<span>Filters</span>} />);

    expect(screen.queryByRole("button", { name: "Fetch new mail" })).not.toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Archive" })).toBeVisible();
  });
});
