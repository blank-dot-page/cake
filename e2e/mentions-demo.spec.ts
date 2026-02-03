import { test, expect } from "playwright/test";
import { getDemoBaseURL } from "./utils";

async function focusEditor(page: any) {
  const editor = page.locator(".cake-content");
  await expect(editor).toBeVisible();
  await editor.click();
}

async function getMarkdownText(page: any): Promise<string> {
  const markdownPanel = page.locator("section.panel", {
    has: page.getByRole("heading", { name: "Markdown" }),
  });
  const pre = markdownPanel.locator("pre");
  await expect(pre).toBeVisible();
  return (await pre.innerText()) ?? "";
}

test.describe("demo mentions (end-to-end)", () => {
  test("popover positions under caret, inserts blue mention, backspace deletes atom", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const baseURL = await getDemoBaseURL();
    await page.goto(`${baseURL}/`);

    await focusEditor(page);

    // Type a unique prefix so assertions are stable even with existing demo content.
    await page.keyboard.type("\n\nMentions: ");

    // Trigger and ensure popover appears under the caret.
    await page.keyboard.type("@ali");
    const popover = page.getByTestId("cake-mention-popover");
    await expect(popover).toBeVisible();

    const caret = page.locator(".cake-caret");
    await expect(caret).toBeVisible();
    const caretBox = await caret.boundingBox();
    const popoverBox = await popover.boundingBox();
    expect(caretBox).not.toBeNull();
    expect(popoverBox).not.toBeNull();

    // Popover should be below caret and roughly aligned on x.
    expect(popoverBox!.y).toBeGreaterThanOrEqual(caretBox!.y + caretBox!.height - 1);
    expect(Math.abs(popoverBox!.x - caretBox!.x)).toBeLessThan(40);

    // Select @alice (aria-label is the username).
    await popover.getByRole("button", { name: "alice" }).click();

    // Mention should be rendered and styled in blue.
    const mention = page.locator(".demoMention.cake-mention");
    await expect(mention).toBeVisible();
    await expect(mention).toHaveAttribute("data-mention-id", "u_01");

    const color = await mention.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(29, 155, 240)");

    // Markdown should contain the serialized token.
    await expect
      .poll(async () => await getMarkdownText(page))
      .toContain("@[u_01](alice)");

    // Atom deletion behavior: type a trailing character and backspace twice.
    await page.keyboard.type("!");
    await expect
      .poll(async () => await getMarkdownText(page))
      .toContain("@[u_01](alice)!");

    await page.keyboard.press("Backspace");
    await expect
      .poll(async () => await getMarkdownText(page))
      .toContain("@[u_01](alice)");

    await page.keyboard.press("Backspace");
    await expect
      .poll(async () => await getMarkdownText(page))
      .not.toContain("@[u_01](alice)");
  });

  test("clicking a mention reopens popover and replaces it (positioned under mention)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 420, height: 760 });
    const baseURL = await getDemoBaseURL();
    await page.goto(`${baseURL}/`);

    await focusEditor(page);
    await page.keyboard.type("\n\nReplace: ");
    await page.keyboard.type("@ali");

    const popover = page.getByTestId("cake-mention-popover");
    await expect(popover).toBeVisible();
    await popover.getByRole("button", { name: "alice" }).click();

    const mention = page.locator(
      ".demoMention.cake-mention[data-mention-id=\"u_01\"]",
    );
    await expect(mention).toBeVisible();

    // Clicking the mention should reopen a popover anchored below it.
    const mentionBox = await mention.boundingBox();
    expect(mentionBox).not.toBeNull();
    await mention.click();

    await expect(popover).toBeVisible();
    const popoverBox = await popover.boundingBox();
    expect(popoverBox).not.toBeNull();
    expect(popoverBox!.y).toBeGreaterThanOrEqual(mentionBox!.y + mentionBox!.height - 1);

    // Replace with @bob.
    await popover.getByRole("button", { name: "bob" }).click();
    const bobMention = page.locator(
      ".demoMention.cake-mention[data-mention-id=\"u_02\"]",
    );
    await expect(bobMention).toBeVisible();
    await expect
      .poll(async () => await getMarkdownText(page))
      .toContain("@[u_02](bob)");
  });

  test("keyboard navigation (arrows + enter) selects an item and does not move the caret", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 720 });
    const baseURL = await getDemoBaseURL();
    await page.goto(`${baseURL}/`);

    await focusEditor(page);
    await page.keyboard.type("\n\nKeyboard: ");

    await page.keyboard.type("@a");
    const popover = page.getByTestId("cake-mention-popover");
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("button", { name: "alice" })).toBeVisible();

    const activeBefore = popover.locator('button[data-active="true"]');
    await expect(activeBefore).toBeVisible();
    const activeBeforeLabel = await activeBefore.getAttribute("aria-label");
    expect(activeBeforeLabel).toBeTruthy();

    const caret = page.locator(".cake-caret");
    await expect(caret).toBeVisible();
    const caretBefore = await caret.boundingBox();
    expect(caretBefore).not.toBeNull();

    // Move active item (should not move the editor caret).
    await page.keyboard.press("ArrowDown");
    const activeAfter = popover.locator('button[data-active="true"]');
    await expect
      .poll(async () => await activeAfter.getAttribute("aria-label"))
      .not.toBe(activeBeforeLabel);

    const caretAfter = await caret.boundingBox();
    expect(caretAfter).not.toBeNull();
    expect(Math.abs((caretAfter!.x ?? 0) - (caretBefore!.x ?? 0))).toBeLessThan(2);
    expect(Math.abs((caretAfter!.y ?? 0) - (caretBefore!.y ?? 0))).toBeLessThan(2);

    // Select active item with Enter.
    const activeAfterLabel = await activeAfter.getAttribute("aria-label");
    expect(activeAfterLabel).toBeTruthy();
    await page.keyboard.press("Enter");

    await expect(
      page.locator(`.cake-mention[data-mention-label=\"${activeAfterLabel}\"]`),
    ).toBeVisible();
  });

  test("mentions insert at the caret and caret can be placed before/after via click", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 720 });
    const baseURL = await getDemoBaseURL();
    await page.goto(`${baseURL}/`);

    await focusEditor(page);
    await page.keyboard.type("\n\nMidline: hello world");

    // Move caret between the space and 'w' in "world".
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("ArrowLeft");
    }

    // Use a query that yields exactly one user so selection is deterministic.
    await page.keyboard.type("@dev");
    const popover = page.getByTestId("cake-mention-popover");
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("button", { name: "devon" })).toBeVisible();
    await page.keyboard.press("Enter");

    await expect
      .poll(async () => await getMarkdownText(page))
      .toContain("hello @[u_04](devon)world");

    const mention = page.locator(
      ".demoMention.cake-mention[data-mention-id=\"u_04\"]",
    );
    await expect(mention).toBeVisible();
    const box = await mention.boundingBox();
    expect(box).not.toBeNull();

    // Clicking the left side should place the caret before the mention.
    await page.mouse.click(box!.x + 2, box!.y + box!.height / 2);
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await page.keyboard.type("X");
    await expect
      .poll(async () => await getMarkdownText(page))
      .toContain("hello X@[u_04](devon)world");

    // Clicking the right side should place the caret after the mention.
    const box2 = await mention.boundingBox();
    expect(box2).not.toBeNull();
    await page.mouse.click(
      box2!.x + box2!.width - 2,
      box2!.y + box2!.height / 2,
    );
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await page.keyboard.type("Y");
    await expect
      .poll(async () => await getMarkdownText(page))
      .toContain("hello X@[u_04](devon)Yworld");
  });
});
