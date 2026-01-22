import { useMemo, useState } from "react";
import { CakeEditorV3, defaultEditorSettings } from "@blankdotpage/cake";

export default function App() {
  const [value, setValue] = useState<string>(
    "# Cake v3 Demo\n\nTry **bold**, *italic*, ~~strike~~, and [links](https://example.com).",
  );

  const settings = useMemo(
    () => ({ ...defaultEditorSettings, spellCheckEnabled: true }),
    [],
  );

  return (
    <div className="app">
      <header>
        <h1>Cake v3 Demo</h1>
        <p>Cmd+B / Cmd+I / Cmd+Shift+X / Cmd+Shift+U</p>
      </header>
      <div className="editor">
        <CakeEditorV3
          initialValue={value}
          value={value}
          onChange={setValue}
          settings={settings}
          placeholder="Start typing..."
          pageId={null}
          canUploadImage={() => false}
          style={{ minHeight: 240, padding: 16 }}
        />
      </div>
      <footer>
        <h2>Markdown</h2>
        <pre>{value}</pre>
      </footer>
    </div>
  );
}
