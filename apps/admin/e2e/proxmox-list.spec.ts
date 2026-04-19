// Playwright smoke: /proxmox list page.
//
// This spec is written as a forward-looking regression guardrail. Primary
// verification in Phase 19-03 is live Playwright MCP run against
// https://homelab.makscee.ru per project memory
// (feedback_test_with_playwright).
//
// To execute locally:
//   cd apps/admin && bun add -d @playwright/test && bunx playwright install
//   PW_BASE_URL=https://homelab.makscee.ru PW_SESSION_COOKIE="<cookie>" \
//     bunx playwright test e2e/proxmox-list.spec.ts
//
// Auth is provided via a pre-obtained NextAuth session cookie (PW_SESSION_COOKIE)
// since the app uses GitHub OAuth and headless browsers cannot complete the flow.

import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PW_BASE_URL ?? "https://homelab.makscee.ru";
const SESSION_COOKIE = process.env.PW_SESSION_COOKIE ?? "";

test.describe("/proxmox — list page", () => {
  test.skip(
    !SESSION_COOKIE,
    "PW_SESSION_COOKIE not set — skipping (Playwright MCP is primary gate)",
  );

  test.beforeEach(async ({ context }) => {
    const url = new URL(BASE_URL);
    await context.addCookies([
      {
        name: "authjs.session-token",
        value: SESSION_COOKIE,
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("renders page title, table with ≥3 LXC rows, no console errors or 5xx", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    const serverErrors: number[] = [];
    page.on("response", (resp) => {
      if (resp.status() >= 500) serverErrors.push(resp.status());
    });

    await page.goto(`${BASE_URL}/proxmox`);

    await expect(
      page.getByRole("heading", { name: /Proxmox LXCs/i }),
    ).toBeVisible();

    // Expect at least 3 data rows — CT 100, 101, 204 are the minimum set.
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(3, { timeout: 10_000 }).catch(async () => {
      // If more than 3, just assert ≥ 3
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    await expect(page.getByText("100", { exact: false })).toBeVisible();
    await expect(page.getByText("101", { exact: false })).toBeVisible();
    await expect(page.getByText("204", { exact: false })).toBeVisible();

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    expect(serverErrors, serverErrors.join(",")).toEqual([]);
  });
});
