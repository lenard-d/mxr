import { describe, expect, test } from "vitest";

import { sidebarItemPath } from "./Sidebar";

describe("sidebarItemPath", () => {
  test("opens subscriptions in the subscriptions route instead of treating it as a label", () => {
    expect(
      sidebarItemPath(
        {
          id: "subscriptions",
          label: "Subscriptions",
          lens: { kind: "subscription" },
        },
        "personal",
      ),
    ).toBe("/subscriptions");
  });

  test("keeps real labels scoped to the active account", () => {
    expect(
      sidebarItemPath(
        {
          id: "receipts",
          label: "Receipts",
          lens: { kind: "label", labelId: "label-1" },
        },
        "personal",
      ),
    ).toBe("/mail/personal/label/label-1");
  });
});
