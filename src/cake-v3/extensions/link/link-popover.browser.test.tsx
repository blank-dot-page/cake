import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CakeEditorV3 } from "../../index";
import type { EditorRefHandle } from "../../../editor";
import { defaultEditorSettings } from "../../../editor";

function renderEditor(markdown: string) {
  const ref = createRef<EditorRefHandle>();
  render(
    <CakeEditorV3
      ref={ref}
      initialValue={markdown}
      value={markdown}
      onChange={() => undefined}
      settings={defaultEditorSettings}
      placeholder=""
      pageId={null}
      canUploadImage={() => true}
      style={{ height: 300, overflow: "auto" }}
    />,
  );
  return { ref };
}

describe("cake-v3 link popover", () => {
  it("shows popover on link click", async () => {
    renderEditor("hello [world](https://example.com)");

    const link = page.getByRole("link", { name: "world" });
    await expect.element(link).toBeVisible();

    await userEvent.click(link);

    const editButton = page.getByRole("button", { name: "Edit link" });
    await expect.element(editButton).toBeVisible();
  });
});
