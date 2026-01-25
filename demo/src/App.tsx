import { useState } from "react";
import { CakeEditor } from "@blankdotpage/cake";

type SelectionDebug = {
  start: number;
  end: number;
  affinity: "forward" | "backward";
};

export default function App() {
  const [value, setValue] = useState<string>(
    "# Cake Demo\n\nTry **bold**, *italic*, ~~strike~~, and [links](https://example.com).",
  );
  const [selection, setSelection] = useState<SelectionDebug | null>(null);

  return (
    <div className="app">
      <header>
        <h1>Cake Demo</h1>
        <p>Cmd+B / Cmd+I / Cmd+Shift+X / Cmd+Shift+U</p>
      </header>
      <main className="content">
        <section className="editor">
          <CakeEditor
            value={value}
            onChange={setValue}
            onSelectionChange={(start, end, affinity) => {
              setSelection({ start, end, affinity: affinity ?? "forward" });
            }}
            placeholder="Start typing..."
            spellCheck
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
