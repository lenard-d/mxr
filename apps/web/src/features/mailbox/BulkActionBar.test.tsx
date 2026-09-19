/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BulkActionBar } from "./BulkActionBar";
import { useConnectionStore } from "@/state/connectionStore";
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
    useConnectionStore.setState({ syncProgress: undefined });
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

  test("shows inline sync progress beside a spinning refresh button", () => {
    useSelection.getState().clear();
    useConnectionStore.setState({
      syncProgress: { account_id: "account-1", current: 12, total: 40 },
    });

    render(<BulkActionBar rows={[]} onRefresh={vi.fn<() => void>()} />);

    const refresh = screen.getByRole("button", { name: "Fetch new mail" });
    const progress = screen.getByRole("status");
    expect(refresh.querySelector("svg")).toHaveClass("animate-spin");
    expect(progress).toHaveTextContent("Syncing 12 of 40");
    expect(progress).toHaveClass("bg-primary-muted");
    expect(refresh.nextElementSibling).toBe(progress);
  });

  test("keeps sync progress and the spinning refresh button visible with a selection", () => {
    useConnectionStore.setState({
      syncProgress: { account_id: "account-1", current: 12, total: 40 },
    });

    render(<BulkActionBar onRefresh={vi.fn<() => void>()} />);

    expect(screen.getByText("2 selected")).toBeVisible();
    const refresh = screen.getByRole("button", { name: "Fetch new mail" });
    const progress = document.querySelector("[data-sync-progress]");
    expect(progress).not.toBeNull();
    expect(refresh.querySelector("svg")).toHaveClass("animate-spin");
    expect(progress).toHaveTextContent("Syncing 12 of 40");
    expect(refresh.nextElementSibling).toBe(progress);
  });
});
