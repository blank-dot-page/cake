import { test, expect } from "playwright/test";
import { getDemoBaseURL } from "./utils";

test("arrow right at end of visual row moves caret to beginning of next row", async ({
  page,
}) => {
  const baseURL = await getDemoBaseURL();
  await page.goto(`${baseURL}/`);

  // Click the editor to focus it
  const editor = page.locator(".cake-content");
  await editor.click();

  // Select all and replace with test text
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(
    "a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
  );

  // Move to start of document
  await page.keyboard.press("Meta+ArrowUp");

  // Get caret position at start - should be at left edge of first row
  const caret = page.locator(".cake-caret");
  const caretAtStart = await caret.boundingBox();
  expect(caretAtStart).not.toBeNull();

  // Move to end of first visual row
  await page.keyboard.press("Meta+ArrowRight");
  await page.waitForTimeout(500);

  // Get caret position - should be at end of first row (right side)
  const caretAtEndOfRow1 = await caret.boundingBox();
  expect(caretAtEndOfRow1).not.toBeNull();

  console.log("caretAtStart:", caretAtStart);
  console.log("caretAtEndOfRow1:", caretAtEndOfRow1);

  // Caret should still be on the same visual row (same y) - THIS IS THE KEY ASSERTION
  expect(caretAtEndOfRow1!.y).toBe(caretAtStart!.y);

  // Caret should have moved right (x increased significantly)
  expect(caretAtEndOfRow1!.x).toBeGreaterThan(caretAtStart!.x + 100);

  // Press arrow right - should visually move to start of next row
  await page.keyboard.press("ArrowRight");

  const caretAtStartOfRow2 = await caret.boundingBox();
  expect(caretAtStartOfRow2).not.toBeNull();

  // Caret should now be near the left edge (same x as start position)
  expect(Math.abs(caretAtStartOfRow2!.x - caretAtStart!.x)).toBeLessThan(5);

  // Caret should be on the next visual row (y increased)
  expect(caretAtStartOfRow2!.y).toBeGreaterThan(caretAtEndOfRow1!.y);
});
