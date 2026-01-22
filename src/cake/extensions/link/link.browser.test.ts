import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeEngine } from "../../engine/cake-engine";
import { bundledExtensions } from "../index";

describe("link extension DOM rendering", () => {
  let container: HTMLDivElement;
  let engine: CakeEngine;

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

  test("renders link with anchor element", () => {
    engine = new CakeEngine({
      container,
      value: "[link text](https://example.com)",
      extensions: bundledExtensions,
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("link text");
    expect(link?.getAttribute("href")).toBe("https://example.com");
  });

  test("renders link with cake-link class", () => {
    engine = new CakeEngine({
      container,
      value: "[link](url)",
      extensions: bundledExtensions,
    });

    const link = container.querySelector("a.cake-link");
    expect(link).not.toBeNull();
  });

  test("renders multiple links", () => {
    engine = new CakeEngine({
      container,
      value: "[first](url1) text [second](url2)",
      extensions: bundledExtensions,
    });

    const links = container.querySelectorAll("a");
    expect(links.length).toBe(2);
    expect(links[0]?.textContent).toBe("first");
    expect(links[1]?.textContent).toBe("second");
  });

  test("renders link with plain text around it", () => {
    engine = new CakeEngine({
      container,
      value: "before [link](url) after",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.textContent).toBe("before link after");
  });

  test("renders link with bold inside", () => {
    engine = new CakeEngine({
      container,
      value: "[**bold link**](url)",
      extensions: bundledExtensions,
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();

    const bold = link?.querySelector("strong");
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe("bold link");
  });

  test("renders link with italic inside", () => {
    engine = new CakeEngine({
      container,
      value: "[_italic link_](url)",
      extensions: bundledExtensions,
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();

    const italic = link?.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent).toBe("italic link");
  });

  test("renders link inside heading", () => {
    engine = new CakeEngine({
      container,
      value: "# [Link](url) Heading",
      extensions: bundledExtensions,
    });

    const heading = container.querySelector(".is-heading");
    expect(heading).not.toBeNull();

    const link = heading?.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe("Link");
  });
});
