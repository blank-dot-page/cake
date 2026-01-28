import { defineConfig, type ViteUserConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import type { BrowserCommand } from "vitest/node";
import react from "@vitejs/plugin-react";

const clickAtCoordinates: BrowserCommand<[x: number, y: number]> = async (
  ctx,
  x,
  y,
) => {
  const page = ctx.page;
  // Get iframe element and its bounding box
  const iframeElement = ctx.iframe.locator(":root");
  const iframeBox = await iframeElement.boundingBox();
  const iframeX = iframeBox ? x + iframeBox.x : x;
  const iframeY = iframeBox ? y + iframeBox.y : y;
  await page.mouse.click(iframeX, iframeY);
};

export default defineConfig({
  plugins: [react()] as unknown as ViteUserConfig["plugins"],
  test: {
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.{ts,tsx}"],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/demo/**",
            "**/*.browser.test.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }, { browser: "webkit" }],
            screenshotDirectory: ".vitest-screenshots",
            commands: {
              clickAtCoordinates,
            },
          },
        },
      },
    ],
  },
});
