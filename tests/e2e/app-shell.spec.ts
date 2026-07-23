import { expect, test } from "@playwright/test";

// Playwright drives the plain web frontend without the Rust backend, so this
// suite only asserts UI that renders before any IPC data arrives (shell,
// page headers, loading/empty states). IPC-backed content is covered by the
// Vitest contract tests and cargo tests instead.

test("renders the top bar shell with platform switcher and create entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("DIY Subagent", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "平台" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Claude Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Codex" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cursor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
  await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建 Subagent" }))
    .toBeVisible();
});

test("navigates to the settings sub-page and back home", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置" }).click();

  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  // Sub-pages collapse the top bar to brand + theme toggle only.
  await expect(page.getByRole("group", { name: "平台" })).toBeHidden();
  await expect(page.getByRole("button", { name: "新建 Subagent" }))
    .toBeHidden();
  const backButton = page.getByRole("button", { name: "返回", exact: true });
  await expect(backButton).toBeVisible();

  await backButton.click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeHidden();
  await expect(page.getByRole("region", { name: "已安装的 subagent" }))
    .toBeVisible();
  await expect(page.getByRole("group", { name: "平台" })).toBeVisible();
  await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
});

test("opens the create page and returns home", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新建 Subagent" }).click();

  await expect(page.getByRole("heading", { name: "新建 Subagent" }))
    .toBeVisible();
  // The top-bar navigation cluster must vanish on the create page so the
  // gear cannot unmount the editor and discard an in-progress draft.
  await expect(page.getByRole("group", { name: "平台" })).toBeHidden();
  await expect(page.getByRole("button", { name: "新建 Subagent" }))
    .toBeHidden();
  await expect(page.getByRole("button", { name: "刷新" })).toBeHidden();
  await expect(page.getByRole("button", { name: "设置" })).toBeHidden();

  await page.getByRole("button", { name: "返回", exact: true }).click();
  await expect(page.getByRole("region", { name: "已安装的 subagent" }))
    .toBeVisible();
  await expect(page.getByRole("group", { name: "平台" })).toBeVisible();
  await expect(page.getByRole("button", { name: "新建 Subagent" }))
    .toBeVisible();
});
