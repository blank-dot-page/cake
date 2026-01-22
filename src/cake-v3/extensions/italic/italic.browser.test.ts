import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeV3Engine } from "../../engine/cake-v3-engine";
import { bundledExtensions } from "../index";

describe("italic extension DOM rendering", () => {
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

  test("renders italic text with em element", () => {
    engine = new CakeV3Engine({
      container,
      value: "_italic_",
      extensions: bundledExtensions,
    });

    const italic = container.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent).toBe("italic");
  });

  test("renders multiple italic spans", () => {
    engine = new CakeV3Engine({
      container,
      value: "_first_ normal _second_",
      extensions: bundledExtensions,
    });

    const italics = container.querySelectorAll("em");
    expect(italics.length).toBe(2);
    expect(italics[0]?.textContent).toBe("first");
    expect(italics[1]?.textContent).toBe("second");
  });

  test("renders italic with plain text around it", () => {
    engine = new CakeV3Engine({
      container,
      value: "before _italic_ after",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.textContent).toBe("before italic after");

    const italic = line?.querySelector("em");
    expect(italic?.textContent).toBe("italic");
  });

  test("renders nested italic and bold", () => {
    engine = new CakeV3Engine({
      container,
      value: "_**bold italic**_",
      extensions: bundledExtensions,
    });

    const italic = container.querySelector("em");
    expect(italic).not.toBeNull();

    const bold = italic?.querySelector("strong");
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe("bold italic");
  });

  test("renders italic inside heading", () => {
    engine = new CakeV3Engine({
      container,
      value: "# _Italic_ Heading",
      extensions: bundledExtensions,
    });

    const heading = container.querySelector(".is-heading");
    expect(heading).not.toBeNull();

    const italic = heading?.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent).toBe("Italic");
  });
});
