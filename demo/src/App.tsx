import { useState } from "react";
import { CakeEditor } from "@blankdotpage/cake";

export default function App() {
  const [value, setValue] = useState(
    "# Cake Demo\n\nTry **bold**, *italic*, ~~strike~~, and [links](https://example.com).",
  );
  const [spellCheck, setSpellCheck] = useState(false);

  return (
    <div className="app">
      <header className="header">
        <div className="headerLeft">
          <h1>Cake Demo</h1>
          <p>Cmd+B / Cmd+I / Cmd+Shift+X / Cmd+Shift+U</p>
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
        <CakeEditor
          value={value}
          onChange={setValue}
          placeholder="Start typing..."
          spellCheck={spellCheck}
          style={{ height: "100%", padding: 24 }}
        />
      </main>
    </div>
  );
}

