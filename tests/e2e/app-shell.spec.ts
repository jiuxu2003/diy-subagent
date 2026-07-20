import { expect, test } from "@playwright/test";

test("renders the desktop shell and primary navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("DIY Subagent", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await expect(page.getByRole("button", { name: "模板" })).toBeVisible();
  await expect(page.getByRole("button", { name: "已安装" })).toBeVisible();
  await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
});
