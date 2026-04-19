// Playwright smoke: /proxmox/[vmid] detail page for CT 101 (jellyfin).
//
// See proxmox-list.spec.ts for setup notes. Primary verification is
// Playwright MCP against homelab.makscee.ru.

import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PW_BASE_URL ?? "https://homelab.makscee.ru";
const SESSION_COOKIE = process.env.PW_SESSION_COOKIE ?? "";
const DETAIL_VMID = process.env.PW_DETAIL_VMID ?? "101";

test.describe("/proxmox/[vmid] — detail page (CT 101)", () => {
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

  test("renders network block, tasks table, and expands task log on click", async ({
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

    await page.goto(`${BASE_URL}/proxmox/${DETAIL_VMID}`);

    // Page heading
    await expect(
      page.getByRole("heading", { name: new RegExp(`LXC\\s+${DETAIL_VMID}`) }),
    ).toBeVisible();

    // Network block
    await expect(
      page.getByRole("heading", { name: /^Network$/ }),
    ).toBeVisible();

    // Recent Tasks section
    await expect(
      page.getByRole("heading", { name: /Recent Tasks/i }),
    ).toBeVisible();

    // Click first task row → inline log <pre> appears
    const firstTaskRow = page
      .locator("tbody tr.cursor-pointer")
      .first();
    if ((await firstTaskRow.count()) > 0) {
      await firstTaskRow.click();
      await expect(page.locator("pre")).toBeVisible({ timeout: 10_000 });
    }

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    expect(serverErrors, serverErrors.join(",")).toEqual([]);
  });
});
