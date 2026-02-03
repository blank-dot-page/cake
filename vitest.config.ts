import { defineConfig, type ViteUserConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import type { BrowserCommand } from "vitest/node";
import react from "@vitejs/plugin-react";

const clickAtCoordinates: BrowserCommand<
  [x: number, y: number, debug?: boolean]
> = async (ctx, x, y, debug) => {
  const page = ctx.page;
  // Get iframe element and its bounding box
  const iframeElement = ctx.iframe.locator(":root");
  const iframeBox = await iframeElement.boundingBox();
  const iframeX = iframeBox ? x + iframeBox.x : x;
  const iframeY = iframeBox ? y + iframeBox.y : y;

  console.log(
    `clickAtCoordinates: input(${x}, ${y}) -> iframeBox(${JSON.stringify(iframeBox)}) -> adjusted(${iframeX}, ${iframeY})`,
  );

  // Place a debug dot if requested - evaluate inside the iframe via locator
  if (debug) {
    await iframeElement.evaluate(
      (_, coords) => {
        const [dotX, dotY] = coords;
        const dot = document.createElement("div");
        dot.style.cssText = `
          position: fixed;
          left: ${dotX - 3}px;
          top: ${dotY - 3}px;
          width: 6px;
          height: 6px;
          background: yellow;
          border: 1px solid red;
          border-radius: 50%;
          z-index: 999999;
          pointer-events: none;
        `;
        dot.className = "debug-click-dot";
        document.body.appendChild(dot);
      },
      [x, y] as [number, number],
    );
  }

  await page.mouse.click(iframeX, iframeY);
};

const tapAtCoordinates: BrowserCommand<[x: number, y: number]> = async (
  ctx,
  x,
  y,
) => {
  const page = ctx.page;
  const iframeElement = ctx.iframe.locator(":root");
  const iframeBox = await iframeElement.boundingBox();
  const iframeX = iframeBox ? x + iframeBox.x : x;
  const iframeY = iframeBox ? y + iframeBox.y : y;
  await page.touchscreen.tap(iframeX, iframeY);
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
            "**/*.ios.browser.test.{ts,tsx}",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["**/*.browser.test.{ts,tsx}"],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "**/demo/**",
            "**/*.ios.browser.test.{ts,tsx}",
          ],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }, { browser: "webkit" }],
            screenshotDirectory: ".vitest-screenshots",
            commands: {
              clickAtCoordinates,
              tapAtCoordinates,
            },
          },
        },
      },
      {
        extends: true,
        test: {
          name: "browser-ios",
          include: ["**/*.ios.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: playwright({
              contextOptions: {
                // Approximate iPhone Safari conditions in Playwright WebKit.
                isMobile: true,
                hasTouch: true,
                viewport: { width: 390, height: 844 },
                deviceScaleFactor: 3,
              },
            }),
            headless: true,
            instances: [{ browser: "webkit" }],
            screenshotDirectory: ".vitest-screenshots",
            commands: {
              clickAtCoordinates,
              tapAtCoordinates,
            },
          },
        },
      },
    ],
  },
});
