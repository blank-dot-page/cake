import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeV3Engine } from "../../engine/cake-v3-engine";
import { bundledExtensions } from "../index";

describe("bold extension DOM rendering", () => {
  let container: HTMLDivElement;
  let engine: CakeV3Engine;

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

  test("renders bold text with strong element", () => {
    engine = new CakeV3Engine({
      container,
      value: "**bold**",
      extensions: bundledExtensions,
    });

    const bold = container.querySelector("strong");
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe("bold");
  });

  test("renders multiple bold spans", () => {
    engine = new CakeV3Engine({
      container,
      value: "**first** normal **second**",
      extensions: bundledExtensions,
    });

    const bolds = container.querySelectorAll("strong");
    expect(bolds.length).toBe(2);
    expect(bolds[0]?.textContent).toBe("first");
    expect(bolds[1]?.textContent).toBe("second");
  });

  test("renders bold with plain text around it", () => {
    engine = new CakeV3Engine({
      container,
      value: "before **bold** after",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.textContent).toBe("before bold after");

    const bold = line?.querySelector("strong");
    expect(bold?.textContent).toBe("bold");
  });

  test("renders nested bold and italic", () => {
    engine = new CakeV3Engine({
      container,
      value: "**_bold italic_**",
      extensions: bundledExtensions,
    });

    const bold = container.querySelector("strong");
    expect(bold).not.toBeNull();

    const italic = bold?.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent).toBe("bold italic");
  });

  test("renders bold inside heading", () => {
    engine = new CakeV3Engine({
      container,
      value: "# **Bold** Heading",
      extensions: bundledExtensions,
    });

    const heading = container.querySelector(".is-heading");
    expect(heading).not.toBeNull();

    const bold = heading?.querySelector("strong");
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe("Bold");
  });
});
