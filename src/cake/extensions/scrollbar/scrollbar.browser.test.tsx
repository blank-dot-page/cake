import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CakeEditor, type CakeEditorRef } from "../../index";
import { scrollbarExtension } from "./index";

const TRACK_PADDING = 8;
const originalConsoleError = console.error;

async function renderScrollbarEditor(markdown: string, height = 200) {
  const ref = createRef<CakeEditorRef>();
  const renderResult = render(
    <div style={{ height, overflow: "hidden" }}>
      <CakeEditor
        ref={ref}
        value={markdown}
        onChange={() => undefined}
        placeholder=""
        extensions={[scrollbarExtension]}
        style={{ height: "100%", overflow: "auto" }}
      />
    </div>,
  );
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return { ref, renderResult };
}

function generateLongContent(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `Line ${i + 1}`).join("\n");
}

function getCakeContainer(): HTMLElement {
  const cake = document.querySelector<HTMLElement>(".cake");
  if (!cake) {
    throw new Error("Cake container not found");
  }
  return cake;
}

async function waitForScrollUpdate(
  element: HTMLElement,
  predicate: () => boolean,
  timeout = 1000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error("Timed out waiting for scroll update");
}

describe("cake scrollbar extension", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation((...args) => {
      const [first] = args;
      if (
        typeof first === "string" &&
        (first.includes("not wrapped in act") ||
          first.includes("not configured to support act"))
      ) {
        return;
      }
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scrollbar appears when content overflows", async () => {
    await renderScrollbarEditor(generateLongContent(50));
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).toBeVisible();
  });

  it("scrollbar is hidden when content fits", async () => {
    await renderScrollbarEditor("Short content");
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).not.toBeInTheDocument();
  });

  it("scrollbar thumb has correct proportional size", async () => {
    await renderScrollbarEditor(generateLongContent(50), 200);
    const thumb = page.getByTestId("scrollbar-thumb");
    await expect.element(thumb).toBeVisible();
    const thumbElement = thumb.element();
    const thumbHeight = thumbElement.getBoundingClientRect().height;
    expect(thumbHeight).toBeGreaterThanOrEqual(30);
    expect(thumbHeight).toBeLessThan(200);
  });

  it("scrollbar is positioned on the right side", async () => {
    await renderScrollbarEditor(generateLongContent(50));
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).toBeVisible();
    const scrollbarElement = scrollbar.element();
    const container = scrollbarElement.parentElement;
    if (!container) {
      throw new Error("Container not found");
    }
    const containerRect = container.getBoundingClientRect();
    const scrollbarRect = scrollbarElement.getBoundingClientRect();
    expect(scrollbarRect.right).toBe(containerRect.right);
  });

  it("clicking track scrolls to that position", async () => {
    await renderScrollbarEditor(generateLongContent(100), 200);
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).toBeVisible();

    const scrollbarElement = scrollbar.element();
    const cake = getCakeContainer();
    const initialScrollTop = cake.scrollTop;
    expect(initialScrollTop).toBe(0);

    const scrollbarRect = scrollbarElement.getBoundingClientRect();
    const clickY = scrollbarRect.top + scrollbarRect.height / 2;
    const clickX = scrollbarRect.left + scrollbarRect.width / 2;

    scrollbarElement.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: clickX,
        clientY: clickY,
      }),
    );

    await waitForScrollUpdate(cake, () => cake.scrollTop > 0);
    expect(cake.scrollTop).toBeGreaterThan(0);
  });

  it("thumb position updates when container scrolls", async () => {
    await renderScrollbarEditor(generateLongContent(100), 200);
    const thumb = page.getByTestId("scrollbar-thumb");
    await expect.element(thumb).toBeVisible();

    const cake = getCakeContainer();
    const thumbElement = thumb.element() as HTMLElement;
    const getThumbTop = () => parseFloat(thumbElement.style.top) || 0;

    const initialThumbTop = getThumbTop();
    expect(initialThumbTop).toBe(TRACK_PADDING);

    cake.scrollTop = 100;
    cake.dispatchEvent(new Event("scroll"));

    await waitForScrollUpdate(cake, () => getThumbTop() > initialThumbTop);
    expect(getThumbTop()).toBeGreaterThan(initialThumbTop);
  });

  it("dragging thumb scrolls content", async () => {
    await renderScrollbarEditor(generateLongContent(100), 200);
    const thumb = page.getByTestId("scrollbar-thumb");
    await expect.element(thumb).toBeVisible();

    const cake = getCakeContainer();
    expect(cake.scrollTop).toBe(0);

    const thumbElement = thumb.element();
    const thumbRect = thumbElement.getBoundingClientRect();
    const centerX = thumbRect.left + thumbRect.width / 2;
    const centerY = thumbRect.top + thumbRect.height / 2;

    thumbElement.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY,
        button: 0,
        buttons: 1,
      }),
    );

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: centerX,
        clientY: centerY + 50,
        button: 0,
        buttons: 1,
      }),
    );

    await waitForScrollUpdate(cake, () => cake.scrollTop > 0);

    document.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
      }),
    );

    expect(cake.scrollTop).toBeGreaterThan(0);
  });

  it("typing lots of text makes scrollbar appear", async () => {
    const { ref } = await renderScrollbarEditor("", 100);

    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).not.toBeInTheDocument();

    const manyLines = generateLongContent(20);
    ref.current?.applyUpdate({ value: manyLines });

    const scrollbarAfter = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbarAfter).toBeVisible();
  });

  it("scrollbar has aria-hidden attribute for accessibility", async () => {
    await renderScrollbarEditor(generateLongContent(50));
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).toBeVisible();
    await expect.element(scrollbar).toHaveAttribute("aria-hidden", "true");
  });

  it("scrollbar hidden when container height is less than minimum thumb height", async () => {
    await renderScrollbarEditor(generateLongContent(50), 20);
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).not.toBeInTheDocument();
  });

  it("thumb height is clamped to track height", async () => {
    await renderScrollbarEditor(generateLongContent(50), 120);
    const thumb = page.getByTestId("scrollbar-thumb");
    await expect.element(thumb).toBeVisible();

    const thumbElement = thumb.element();
    const cake = getCakeContainer();
    const thumbHeight = thumbElement.getBoundingClientRect().height;
    const trackHeight = cake.clientHeight;

    expect(thumbHeight).toBeLessThanOrEqual(trackHeight);
  });

  it("thumb is at top of track when scrolled to top", async () => {
    await renderScrollbarEditor(generateLongContent(100), 200);
    const thumb = page.getByTestId("scrollbar-thumb");
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(thumb).toBeVisible();

    const cake = getCakeContainer();
    cake.scrollTop = 0;
    cake.dispatchEvent(new Event("scroll"));

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const thumbRect = thumb.element().getBoundingClientRect();
    const trackRect = scrollbar.element().getBoundingClientRect();

    expect(Math.abs(thumbRect.top - trackRect.top)).toBeLessThanOrEqual(
      TRACK_PADDING + 1,
    );
  });

  it("thumb is at bottom of track when scrolled to bottom", async () => {
    await renderScrollbarEditor(generateLongContent(100), 200);
    const thumb = page.getByTestId("scrollbar-thumb");
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(thumb).toBeVisible();

    const cake = getCakeContainer();
    cake.scrollTop = cake.scrollHeight - cake.clientHeight;
    cake.dispatchEvent(new Event("scroll"));

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const thumbRect = thumb.element().getBoundingClientRect();
    const trackRect = scrollbar.element().getBoundingClientRect();

    expect(Math.abs(thumbRect.bottom - trackRect.bottom)).toBeLessThanOrEqual(
      TRACK_PADDING + 1,
    );
  });

  it("scrollbar track remains visible in viewport when scrolling", async () => {
    await renderScrollbarEditor(generateLongContent(100), 200);
    const scrollbar = page.getByTestId("custom-scrollbar");
    await expect.element(scrollbar).toBeVisible();

    const cake = getCakeContainer();
    const containerRect = cake.getBoundingClientRect();

    cake.scrollTop = (cake.scrollHeight - cake.clientHeight) / 2;
    cake.dispatchEvent(new Event("scroll"));

    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const trackRect = scrollbar.element().getBoundingClientRect();

    expect(trackRect.top).toBeGreaterThanOrEqual(containerRect.top - 1);
    expect(trackRect.bottom).toBeLessThanOrEqual(containerRect.bottom + 1);
  });
});
