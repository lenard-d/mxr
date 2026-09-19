import { expect, test } from "@playwright/test";

import { openApp, readE2EState } from "./helpers/state";

test("manual sync shows mailbox progress until completion", async ({ page }) => {
  await openApp(page, "/m/inbox");
  await expect(page.getByRole("img", { name: /^connection: connected$/i })).toBeVisible();
  await expect(page.getByRole("article").first()).toBeVisible();

  const { token } = readE2EState();
  const syncResponse = page.request.post("/api/v1/mail/sync", {
    headers: { authorization: `Bearer ${token}` },
  });

  const progress = page.locator("[data-sync-progress]");
  await expect(progress).toBeVisible();
  await expect(progress).toContainText(/^Syncing \d+ of \d+$/);
  await expect(page.getByRole("button", { name: "Fetch new mail" }).locator("svg")).toHaveClass(
    /animate-spin/,
  );

  const response = await syncResponse;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(progress).toBeHidden({ timeout: 5_000 });
});
