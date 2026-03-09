import { expect, test } from "playwright/test";
import { getDemoBaseURL } from "./utils";

test("delayed controlled selection sync does not steal focus from external input", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "firefox", "Firefox-specific regression");

  const baseURL = await getDemoBaseURL();
  await page.goto(`${baseURL}/?focus-harness=1`);

  const editor = page.locator(".cake-content");
  await editor.click();
  await page.keyboard.press("Meta+a");

  const promptButton = page.getByTestId("focus-steal-open");
  await promptButton.click();

  const promptInput = page.getByTestId("focus-steal-input");
  await expect(promptInput).toBeFocused();

  await page.waitForTimeout(1500);

  await expect(promptInput).toBeFocused();
  await page.keyboard.type("aa");
  await expect(promptInput).toHaveValue("aa");
});
