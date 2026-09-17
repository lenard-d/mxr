/* @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MailboxList } from "./MailboxList";
import { MailboxRow } from "./MailboxRow";
import type { MessageGroupView, MessageRowView } from "./types";
import { defaultShortcutPreferences } from "@/lib/keybindings";
import { useMailboxPane } from "@/state/mailboxPaneStore";
import { useSelection } from "@/state/selectionStore";
import { useUiPrefs } from "@/state/uiPrefsStore";

const router = vi.hoisted(() => ({
  navigate: vi.fn<(options: unknown) => Promise<void>>(),
}));

const mutation = vi.hoisted(() => ({
  mutate: vi.fn<(ids: string[]) => void>(),
  isPending: false,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => router.navigate,
}));

vi.mock("./useOptimisticMailMutation", () => ({
  useOptimisticMailMutation: () => mutation,
}));

const rows: MessageRowView[] = ["msg-1", "msg-2", "msg-3"].map((id, index) => ({
  id,
  kind: "thread",
  thread_id: `thread-${index + 1}`,
  provider_id: `provider-${index + 1}`,
  sender: `Sender ${index + 1}`,
  subject: `Subject ${index + 1}`,
  snippet: "Snippet",
  date: "2026-05-11T10:00:00Z",
  date_label: "May 11",
  date_full: "May 11, 2026, 10:00 AM",
  date_relative: "now",
  unread: false,
  starred: false,
  has_attachments: false,
}));

const groups: MessageGroupView[] = [{ id: "today", label: "Today", rows }];

describe("MailboxList keyboard selection", () => {
  beforeEach(() => {
    useMailboxPane.setState({
      activePane: "mailbox",
      sidebarIndex: 0,
      suppressNextReaderFocus: false,
    });
    useSelection.setState({ scope: null, ids: new Set(), lastClickedId: null });
    useUiPrefs.setState({ keybindings: defaultShortcutPreferences() });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useSelection.getState().clear();
    useMailboxPane.setState({
      activePane: "mailbox",
      sidebarIndex: 0,
      suppressNextReaderFocus: false,
    });
  });

  test("selects all visible rows with ctrl-a and clears with escape", async () => {
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);

    expect(await screen.findByRole("checkbox", { name: /select all messages in view/i })).toBeVisible();

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });

    expect([...useSelection.getState().ids]).toEqual(["msg-1", "msg-2", "msg-3"]);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(useSelection.getState().ids.size).toBe(0);
  });

  test("extends selection from the last selected row with shift-x", async () => {
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);

    expect(await screen.findByRole("checkbox", { name: /select all messages in view/i })).toBeVisible();

    fireEvent.keyDown(window, { key: "x" });
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "X", shiftKey: true });

    expect([...useSelection.getState().ids]).toEqual(["msg-1", "msg-2"]);
  });

  test("keeps keyboard focus on the same message when rows shift", async () => {
    const { rerender } = render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);

    expect(await screen.findByRole("checkbox", { name: /select all messages in view/i })).toBeVisible();

    fireEvent.keyDown(window, { key: "j" });

    const first = rows[0];
    if (!first) throw new Error("missing first row");
    const prepended: MessageRowView = {
      ...first,
      id: "msg-0",
      thread_id: "thread-0",
      provider_id: "provider-0",
      subject: "Subject 0",
    };
    rerender(
      <MailboxList
        groups={[{ id: "today", label: "Today", rows: [prepended, ...rows] }]}
        mailboxPath="/m/inbox"
      />,
    );

    fireEvent.keyDown(window, { key: "x" });

    expect([...useSelection.getState().ids]).toEqual(["msg-2"]);
  });

  test("jumps to the top with gg and bottom with G", async () => {
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);

    expect(await screen.findByRole("checkbox", { name: /select all messages in view/i })).toBeVisible();

    fireEvent.keyDown(window, { key: "G", shiftKey: true });
    fireEvent.keyDown(window, { key: "x" });

    expect([...useSelection.getState().ids]).toEqual(["msg-3"]);

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "x" });

    expect([...useSelection.getState().ids]).toEqual(["msg-1"]);
  });

  test("keeps mailbox pane active when keyboard preview opens the next thread", async () => {
    render(
      <MailboxList
        groups={groups}
        mailboxPath="/m/inbox"
        activeThreadId="thread-1"
        previewOnFocus
      />,
    );

    expect(await screen.findByRole("checkbox", { name: /select all messages in view/i })).toBeVisible();

    fireEvent.keyDown(window, { key: "j" });

    expect(useMailboxPane.getState().activePane).toBe("mailbox");
    expect(useMailboxPane.getState().suppressNextReaderFocus).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith({ to: "/m/inbox/thread-2" });
  });

  test("escape closes an open clicked thread when there is no active selection", async () => {
    render(
      <MailboxList
        groups={groups}
        mailboxPath="/m/inbox"
        activeThreadId="thread-1"
        previewOnFocus
      />,
    );

    expect(await screen.findByRole("checkbox", { name: /select all messages in view/i })).toBeVisible();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(router.navigate).toHaveBeenCalledWith({ to: "/m/inbox" });
  });

  test("shows attachment status in the mailbox row", async () => {
    render(
      <MailboxRow
        row={{ ...rows[0]!, has_attachments: true, attachment_filename: "quote.pdf" }}
        selected={false}
        focused={false}
        onOpen={vi.fn<() => void>()}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
      />,
    );

    expect(screen.getByLabelText("Has attachments")).toBeVisible();
    expect(screen.getByRole("article", { name: /has attachments/i })).toBeVisible();
  });

  test("shows conversation thread count in the mailbox row", async () => {
    render(
      <MailboxRow
        row={{ ...rows[0]!, message_count: 4 }}
        selected={false}
        focused={false}
        onOpen={vi.fn<() => void>()}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
      />,
    );

    expect(screen.getByLabelText("Conversation thread with 4 messages")).toBeVisible();
    expect(
      screen.getByRole("article", { name: /conversation thread with 4 messages/i }),
    ).toBeVisible();
  });

  test("shows open commitment count in the mailbox row", async () => {
    render(
      <MailboxRow
        row={{ ...rows[0]!, open_commitment_count: 2 }}
        selected={false}
        focused={false}
        onOpen={vi.fn<() => void>()}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
      />,
    );

    expect(screen.getByLabelText("2 open commitments")).toBeVisible();
    expect(screen.getByRole("article", { name: /2 open commitments/i })).toBeVisible();
  });

  test("r marks the selected rows read and u marks the focused row unread", async () => {
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);

    expect(await screen.findByRole("checkbox", { name: /select all messages in view/i })).toBeVisible();

    fireEvent.keyDown(window, { key: "r" });
    expect(mutation.mutate).toHaveBeenCalledWith(["msg-1"]);

    mutation.mutate.mockClear();
    fireEvent.keyDown(window, { key: "u" });
    expect(mutation.mutate).toHaveBeenCalledWith(["msg-1"]);
  });

  test("uses persisted mailbox shortcuts for movement, mutation, and focus", async () => {
    useUiPrefs.setState({
      keybindings: {
        ...defaultShortcutPreferences(),
        "mailbox.move-next": "n",
        "mailbox.archive": "q",
        "mailbox.focus-sidebar": "b",
      },
    });
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);

    await screen.findByRole("checkbox", { name: /select all messages in view/i });
    fireEvent.keyDown(window, { key: "n" });
    fireEvent.keyDown(window, { key: "q" });
    expect(mutation.mutate).toHaveBeenCalledWith(["msg-2"]);

    fireEvent.keyDown(window, { key: "b" });
    expect(useMailboxPane.getState().activePane).toBe("sidebar");
  });

  test("supports explicit uppercase read/unread and Gmail-style trash shortcuts", async () => {
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);
    await screen.findByRole("checkbox", { name: /select all messages in view/i });

    fireEvent.keyDown(window, { key: "R" });
    fireEvent.keyDown(window, { key: "U" });
    fireEvent.keyDown(window, { key: "#" });

    expect(mutation.mutate).toHaveBeenNthCalledWith(1, ["msg-1"]);
    expect(mutation.mutate).toHaveBeenNthCalledWith(2, ["msg-1"]);
    expect(mutation.mutate).toHaveBeenNthCalledWith(3, ["msg-1"]);
  });

  test("row controls do not bubble Enter or Space into thread opening", () => {
    const onOpen = vi.fn<() => void>();
    render(
      <MailboxRow
        row={rows[0]!}
        selected={false}
        focused={false}
        onOpen={onOpen}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: /select message/i });
    fireEvent.keyDown(checkbox, { key: " " });
    fireEvent.keyDown(screen.getByRole("button", { name: "Star" }), { key: "Enter" });

    expect(onOpen).not.toHaveBeenCalled();
  });

  test("keeps the selected checkbox checked while the row is hovered", () => {
    render(
      <MailboxRow
        row={rows[0]!}
        selected
        focused={false}
        onOpen={vi.fn<() => void>()}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: /deselect message/i });
    fireEvent.mouseEnter(screen.getByRole("article"));

    expect(checkbox).toHaveAttribute("data-state", "checked");
    expect(checkbox.querySelector("svg")).toBeInTheDocument();
  });

  test("keeps a visible square checkbox and a single-line subject/snippet lane", () => {
    const { container } = render(
      <MailboxRow
        row={rows[0]!}
        selected={false}
        focused={false}
        onOpen={vi.fn<() => void>()}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
        dragSource={{ type: "mail-row", messageIds: ["msg-1"] }}
      />,
    );

    expect(screen.getByRole("checkbox", { name: /select message/i })).toHaveClass(
      "rounded-none",
      "mailbox-checkbox",
    );
    const selectionLane = container.querySelector('[data-mailbox-control="selection"]');
    expect(selectionLane).toHaveClass("mailbox-selection-lane", "size-8");

    const subject = container.querySelector(".mailbox-row-subject");
    expect(subject).toHaveClass("min-w-0", "shrink");
    expect(subject).not.toHaveClass("max-w-[48%]");
    const contentLane = subject?.parentElement;
    expect(contentLane).toContainElement(container.querySelector(".mailbox-row-snippet"));
    expect(container.querySelector(".mailbox-row-snippet")).toHaveClass("min-w-0", "flex-1");

    const quickActions = container.querySelector(".mailbox-row-quick-actions");
    expect(quickActions).not.toHaveClass("bg-inherit");
    expect(screen.getByRole("button", { name: "Archive" })).toHaveClass(
      "size-10",
      "rounded-md",
      "md:size-8",
    );
    expect(screen.getByRole("button", { name: "Archive" }).querySelector("svg")).toHaveClass(
      "size-4",
    );
    expect(screen.getByRole("article")).toHaveAttribute("aria-roledescription", "draggable");
    expect(screen.queryByRole("button", { name: /drag/i })).not.toBeInTheDocument();
  });
});

describe("MailboxList readOnly mode", () => {
  beforeEach(() => {
    useMailboxPane.setState({
      activePane: "mailbox",
      sidebarIndex: 0,
      suppressNextReaderFocus: false,
    });
    useSelection.setState({ scope: null, ids: new Set(), lastClickedId: null });
    useUiPrefs.setState({ keybindings: defaultShortcutPreferences() });
  });

  afterEach(() => {
    vi.clearAllMocks();
    useSelection.getState().clear();
  });

  test("hides bulk selection and ignores mutation keys", async () => {
    render(<MailboxList groups={groups} mailboxPath="/analytics/stale" readOnly />);

    expect(await screen.findByRole("region", { name: /mailbox messages/i })).toBeVisible();
    expect(screen.queryByText(/loaded/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /select all/i })).toBeNull();

    fireEvent.keyDown(window, { key: "a", ctrlKey: true });
    expect(useSelection.getState().ids.size).toBe(0);
    fireEvent.keyDown(window, { key: "x" });
    expect(useSelection.getState().ids.size).toBe(0);
  });

  test("non-readOnly still exposes bulk selection", async () => {
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);
    expect(
      await screen.findByRole("checkbox", { name: /select all messages in view/i }),
    ).toBeVisible();
  });

  test("shows an indeterminate master checkbox when only some loaded rows are selected", async () => {
    useSelection.setState({
      scope: "/m/inbox",
      ids: new Set(["msg-1"]),
      lastClickedId: "msg-1",
    });
    render(<MailboxList groups={groups} mailboxPath="/m/inbox" />);

    const master = await screen.findByRole("checkbox", { name: /select all messages in view/i });
    expect(master.parentElement).toHaveClass("mailbox-selection-lane", "size-8");
    expect(master).toHaveAttribute("data-state", "indeterminate");
    expect(master).toHaveAttribute("aria-checked", "mixed");

    fireEvent.click(master);
    expect([...useSelection.getState().ids]).toEqual(["msg-1", "msg-2", "msg-3"]);
  });
});

describe("MailboxRow readOnly + trailingAction", () => {
  test("readOnly row hides star and selection controls", () => {
    render(
      <MailboxRow
        row={rows[0]!}
        selected={false}
        focused={false}
        onOpen={vi.fn<() => void>()}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
        readOnly
      />,
    );

    expect(screen.queryByRole("button", { name: /star/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /select message|deselect message/i })).toBeNull();
  });

  test("trailing action fires without opening the row", () => {
    const onAction = vi.fn<(id: string) => void>();
    const onOpen = vi.fn<() => void>();
    render(
      <MailboxRow
        row={rows[0]!}
        selected={false}
        focused={false}
        onOpen={onOpen}
        onFocusPane={vi.fn<() => void>()}
        onToggleSelection={vi.fn<(shift: boolean) => void>()}
        trailingAction={
          <button type="button" onClick={() => onAction(rows[0]!.id)}>
            Remove
          </button>
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onAction).toHaveBeenCalledWith("msg-1");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
