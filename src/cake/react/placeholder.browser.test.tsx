import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { CakeEditor, type CakeEditorRef } from "./index";
import { bundledExtensions } from "../extensions";

afterEach(async () => {
  await cleanup();
});

async function renderEditor({
  value,
  placeholder,
}: {
  value: string;
  placeholder: string;
}) {
  const ref = createRef<CakeEditorRef>();
  await render(
    <CakeEditor
      ref={ref}
      value={value}
      onChange={() => undefined}
      placeholder={placeholder}
      extensions={bundledExtensions}
      style={{ height: 160, overflow: "auto" }}
    />,
  );
  return ref;
}

function getPlaceholder(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".cake-placeholder");
}

	describe("cake placeholder", () => {
	  it("renders placeholder when value is empty and placeholder is non-empty", async () => {
	    await renderEditor({ value: "", placeholder: "Start writing..." });
	    const placeholder = getPlaceholder();
	    expect(placeholder).not.toBeNull();
	    expect(placeholder?.textContent).toBe("Start writing...");
	  });

	  it("does not render placeholder when placeholder is empty", async () => {
	    await renderEditor({ value: "", placeholder: "" });
	    expect(getPlaceholder()).toBeNull();
	  });

	  it("does not render placeholder when value is non-empty", async () => {
	    await renderEditor({ value: "hello", placeholder: "Start writing..." });
	    expect(getPlaceholder()).toBeNull();
	  });
	});
