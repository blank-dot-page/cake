import { useRef, useState } from "react";
import { CakeEditor, CakeEditorRef } from "@blankdotpage/cake";
import {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleLink,
  toggleHeading,
  toggleBulletList,
  toggleNumberedList,
  toggleQuote,
} from "../../src/codemirror/markdown-commands";

type FontStyle = "sans" | "serif" | "mono";

export default function App() {
  const editorRef = useRef<CakeEditorRef>(null);
  const [value, setValue] = useState(
    "# Cake Demo\n\nTry **bold**, *italic*, ~~strike~~, and [links](https://example.com).",
  );
  const [spellCheck, setSpellCheck] = useState(false);
  const [fontStyle, setFontStyle] = useState<FontStyle>("sans");
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    affinity: "forward" | "backward";
  } | null>(null);

  const hasSelection = selection && selection.start !== selection.end;

  return (
    <div className="app">
      <header className="header">
        <div className="headerLeft">
          <h1>Cake Demo</h1>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={spellCheck}
            onChange={(event) => setSpellCheck(event.target.checked)}
          />
          <span>spellcheck</span>
        </label>
      </header>

      <main className="main">
        <section className="editorCard">
          <div className="toolbar">
            <div className="toolbarGroup">
              <button
                className="toolbarButton"
                onClick={() => editorRef.current?.executeCommand(toggleBold)}
                title="Bold (Cmd+B)"
                disabled={!hasSelection}
              >
                <strong>B</strong>
              </button>
              <button
                className="toolbarButton"
                onClick={() => editorRef.current?.executeCommand(toggleItalic)}
                title="Italic (Cmd+I)"
                disabled={!hasSelection}
              >
                <em>I</em>
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(toggleStrikethrough)
                }
                title="Strikethrough (Cmd+Shift+X)"
                disabled={!hasSelection}
              >
                <s>S</s>
              </button>
              <button
                className="toolbarButton"
                onClick={() => editorRef.current?.executeCommand(toggleLink)}
                title="Link (Cmd+Shift+U)"
                disabled={!hasSelection}
              >
                Link
              </button>
            </div>
            <div className="toolbarDivider" />
            <div className="toolbarGroup">
              <button
                className="toolbarButton"
                onClick={() => editorRef.current?.executeCommand(toggleHeading)}
                title="Heading"
              >
                H1
              </button>
              <button
                className="toolbarButton"
                onClick={() => editorRef.current?.executeCommand(toggleQuote)}
                title="Quote"
              >
                Quote
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(toggleBulletList)
                }
                title="Bullet List (Cmd+Shift+8)"
              >
                List
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(toggleNumberedList)
                }
                title="Numbered List (Cmd+Shift+7)"
              >
                1.
              </button>
            </div>
            <div className="toolbarDivider" />
            <div className="toolbarGroup fontSwitcher">
              <button
                className={`toolbarButton ${fontStyle === "sans" ? "active" : ""}`}
                onClick={() => setFontStyle("sans")}
                title="Sans-serif font"
              >
                Sans
              </button>
              <button
                className={`toolbarButton ${fontStyle === "serif" ? "active" : ""}`}
                onClick={() => setFontStyle("serif")}
                title="Serif font"
              >
                Serif
              </button>
              <button
                className={`toolbarButton ${fontStyle === "mono" ? "active" : ""}`}
                onClick={() => setFontStyle("mono")}
                title="Monospace font"
              >
                Mono
              </button>
            </div>
          </div>
          <CakeEditor
            ref={editorRef}
            className={`font-${fontStyle}`}
            value={value}
            onChange={setValue}
            onSelectionChange={(start, end, affinity) => {
              setSelection({
                start,
                end,
                affinity: affinity ?? "forward",
              });
            }}
            placeholder="Start typing..."
            spellCheck={spellCheck}
            style={{ height: "100%", padding: 24 }}
          />
        </section>

        <aside className="sidebar">
          <section className="panel">
            <h2>Selection</h2>
            <pre className="panelPre">
              {JSON.stringify(
                selection
                  ? {
                      ...selection,
                      length: Math.abs(selection.end - selection.start),
                    }
                  : null,
                null,
                2,
              )}
            </pre>
          </section>
          <section className="panel">
            <h2>Markdown</h2>
            <pre className="panelPre">{value}</pre>
          </section>
        </aside>
      </main>
    </div>
  );
}
