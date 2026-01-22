import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CakeEditorV3 } from "../index";
import type { EditorRefHandle } from "../../editor";
import { defaultEditorSettings } from "../../editor";

function renderEditor({
  value,
  placeholder,
}: {
  value: string;
  placeholder: string;
}) {
  const ref = createRef<EditorRefHandle>();
  render(
    <CakeEditorV3
      ref={ref}
      initialValue={value}
      value={value}
      onChange={() => undefined}
      settings={defaultEditorSettings}
      placeholder={placeholder}
      pageId={null}
      canUploadImage={() => true}
      style={{ height: 160, overflow: "auto" }}
    />,
  );
  return ref;
}

function getPlaceholder(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".cake-placeholder");
}

describe("cake-v3 placeholder", () => {
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
