import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CakeEditor, type CakeEditorRef } from "../index";

function renderEditor({
  value,
  placeholder,
}: {
  value: string;
  placeholder: string;
}) {
  const ref = createRef<CakeEditorRef>();
  render(
    <CakeEditor
      ref={ref}
      value={value}
      onChange={() => undefined}
      placeholder={placeholder}
      style={{ height: 160, overflow: "auto" }}
    />,
  );
  return ref;
}

function getPlaceholder(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".cake-placeholder");
}

describe("cake placeholder", () => {
  it("renders placeholder when value is empty and placeholder is non-empty", () => {
    renderEditor({ value: "", placeholder: "Start writing..." });
    const placeholder = getPlaceholder();
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toBe("Start writing...");
  });

  it("does not render placeholder when placeholder is empty", () => {
    renderEditor({ value: "", placeholder: "" });
    expect(getPlaceholder()).toBeNull();
  });

  it("does not render placeholder when value is non-empty", () => {
    renderEditor({ value: "hello", placeholder: "Start writing..." });
    expect(getPlaceholder()).toBeNull();
  });
});
