import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeEditor } from "../../editor/cake-editor";
import { bundledExtensions } from "../index";

describe("image extension DOM rendering", () => {
  let container: HTMLDivElement;
  let engine: CakeEditor;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "600px";
    container.style.height = "400px";
    container.style.overflow = "auto";
    document.body.appendChild(container);
  });

  afterEach(() => {
    engine?.destroy();
    document.body.removeChild(container);
  });

  test("renders ready image with img element", () => {
    engine = new CakeEditor({
      container,
      value: "![alt text](https://example.com/image.png)",
      extensions: bundledExtensions,
    });

    const img = container.querySelector("img.cake-image");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/image.png");
    expect(img?.getAttribute("alt")).toBe("alt text");
  });

  test("renders image with empty alt", () => {
    engine = new CakeEditor({
      container,
      value: "![](https://example.com/image.png)",
      extensions: bundledExtensions,
    });

    const img = container.querySelector("img.cake-image");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
  });

  test("renders uploading image with skeleton", () => {
    engine = new CakeEditor({
      container,
      value: "![uploading:abc123]()",
      extensions: bundledExtensions,
    });

    const skeleton = container.querySelector(
      '[data-testid="image-upload-skeleton"]',
    );
    expect(skeleton).not.toBeNull();
    expect(skeleton?.classList.contains("cake-image-skeleton")).toBe(true);

    const img = container.querySelector("img.cake-image");
    expect(img).not.toBeNull();
  });

  test("image block is not contenteditable", () => {
    engine = new CakeEditor({
      container,
      value: "![alt](url)",
      extensions: bundledExtensions,
    });

    const blockAtom = container.querySelector('[data-block-atom="image"]');
    expect(blockAtom).not.toBeNull();
    expect(blockAtom?.getAttribute("contenteditable")).toBe("false");
  });

  test("renders multiple images", () => {
    engine = new CakeEditor({
      container,
      value: "![a](url1)\n![b](url2)",
      extensions: bundledExtensions,
    });

    const images = container.querySelectorAll("img.cake-image");
    expect(images.length).toBe(2);
    expect(images[0]?.getAttribute("alt")).toBe("a");
    expect(images[1]?.getAttribute("alt")).toBe("b");
  });

  test("renders mixed content with images and paragraphs", () => {
    engine = new CakeEditor({
      container,
      value: "paragraph\n![img](url)\nanother paragraph",
      extensions: bundledExtensions,
    });

    const allLines = container.querySelectorAll(".cake-line");
    expect(allLines.length).toBe(3);

    expect(allLines[0]?.textContent).toBe("paragraph");
    expect(allLines[1]?.querySelector("img")).not.toBeNull();
    expect(allLines[2]?.textContent).toBe("another paragraph");
  });

  test("has data-line-index attribute", () => {
    engine = new CakeEditor({
      container,
      value: "![alt](url)",
      extensions: bundledExtensions,
    });

    const line = container.querySelector("[data-block-atom='image']");
    expect(line).not.toBeNull();
    expect(line?.getAttribute("data-line-index")).toBe("0");
  });

  test("line indexes are sequential with mixed content", () => {
    engine = new CakeEditor({
      container,
      value: "text\n![img](url)\nmore text",
      extensions: bundledExtensions,
    });

    const lines = container.querySelectorAll(".cake-line");
    expect(lines.length).toBe(3);
    expect(lines[0]?.getAttribute("data-line-index")).toBe("0");
    expect(lines[1]?.getAttribute("data-line-index")).toBe("1");
    expect(lines[2]?.getAttribute("data-line-index")).toBe("2");
  });

  test("uploading skeleton has dimensions", () => {
    engine = new CakeEditor({
      container,
      value: "![uploading:test]()",
      extensions: bundledExtensions,
    });

    const skeleton = container.querySelector(
      '[data-testid="image-upload-skeleton"]',
    ) as HTMLElement;
    expect(skeleton).not.toBeNull();
    expect(skeleton.style.width).toBe("300px");
    expect(skeleton.style.height).toBe("200px");
  });
});
