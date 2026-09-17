import { describe, expect, it } from "vitest";

import {
  buildMailPath,
  buildMailThreadPathFromMailboxPath,
  parseMailLocation,
} from "./location";

describe("mail location", () => {
  it("round-trips encoded canonical mailbox thread paths", () => {
    const path = buildMailPath({
      accountKey: "work/team",
      lens: { kind: "label", labelId: "Needs review" },
      threadId: "thread/42",
    });

    expect(path).toBe("/mail/work%2Fteam/label/Needs%20review/thread/thread%2F42");
    expect(parseMailLocation(path)).toEqual({
      source: "canonical",
      accountKey: "work/team",
      lens: { kind: "label", labelId: "Needs review" },
      threadId: "thread/42",
    });
  });

  it("parses legacy mailbox paths for redirect handling", () => {
    expect(parseMailLocation("/m/label/reply-queue/thread-1")).toEqual({
      source: "legacy",
      lens: { kind: "label", labelId: "reply-queue" },
      threadId: "thread-1",
    });
  });

  it("adds a canonical thread segment to its mailbox path", () => {
    expect(buildMailThreadPathFromMailboxPath("/mail/personal/inbox", "thread/7")).toBe(
      "/mail/personal/inbox/thread/thread%2F7",
    );
  });
});
