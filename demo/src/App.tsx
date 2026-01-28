import { useState } from "react";
import { CakeEditor } from "@blankdotpage/cake";

export default function App() {
  const [value, setValue] = useState(
    "# Cake Demo\n\nTry **bold**, *italic*, ~~strike~~, and [links](https://example.com).",
  );
  const [spellCheck, setSpellCheck] = useState(false);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    affinity: "forward" | "backward";
  } | null>(null);

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
          <CakeEditor
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
