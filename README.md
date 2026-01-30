# 🍰 Cake

Cake is a small, extension-first, markdown-based editor toolkit. It’s designed
to give you a reliable plain-text source of truth while still supporting rich
behaviors (bold, links, lists, images, overlays) through extensions. The project
includes a core runtime, a DOM/engine layer, and a thin React wrapper.

## What it does

- **Edits plain text with markdown semantics**: the underlying value is always
  a markdown string, not a proprietary document model.
- **Runs on a runtime+engine split**: the runtime parses/serializes and applies
  edit commands; the engine handles DOM rendering, selection, and events.
- **Extensible by design**: features are extensions (inline, block, overlay)
  that can add syntax, behavior, and UI without changing the core.

## How it’s different from other editors

- **No hidden document model**: Cake never stores a separate rich‑text AST.
  The markdown string is the source of truth.
- **Extension-first architecture**: rich features are optional and removable,
  rather than baked into a monolith.
- **Tested at the behavior level**: includes Vitest unit + browser tests to
  validate parsing, selection, and DOM behavior.

## When to use it

- You want **markdown as the canonical format**.
- You need **custom editing features** without forking a large editor.
- You prefer a **small surface area** and predictable behavior.

If you need a full WYSIWYG document editor with complex layout, tables, or
collaborative editing out of the box, Cake likely isn’t the right fit.

## Development

```bash
npm install
npm run test
npm run build
```

## Demo

```bash
npm --workspace demo install
npm run demo
```

## Library usage

### With React

```tsx
import { CakeEditor } from "@blankdotpage/cake/react";
import { boldExtension } from "@blankdotpage/cake/extensions/bold";
import { italicExtension } from "@blankdotpage/cake/extensions/italic";
import { linkExtension } from "@blankdotpage/cake/extensions/link";
import { headingExtension } from "@blankdotpage/cake/extensions/heading";
import { plainTextListExtension } from "@blankdotpage/cake/extensions/list";

const extensions = [
  headingExtension,
  plainTextListExtension,
  boldExtension,
  italicExtension,
  linkExtension,
];

function MyEditor() {
  const [value, setValue] = useState("");

  return (
    <CakeEditor
      value={value}
      onChange={setValue}
      extensions={extensions}
      placeholder="Start typing..."
    />
  );
}
```

### Without React

```ts
import { CakeEditor } from "@blankdotpage/cake";
import { boldExtension } from "@blankdotpage/cake/extensions/bold";
import { italicExtension } from "@blankdotpage/cake/extensions/italic";
import { linkExtension } from "@blankdotpage/cake/extensions/link";

const container = document.getElementById("editor");

const engine = new CakeEditor({
  container,
  value: "Hello **world**",
  extensions: [boldExtension, italicExtension, linkExtension],
  onChange: (value, selection) => {
    console.log("Content changed:", value);
  },
  onSelectionChange: (selection) => {
    console.log("Selection:", selection);
  },
});

// Later: clean up
engine.destroy();
```

### Available extensions

- `blockquoteExtension` - Block quotes (`>`)
- `boldExtension` - Bold text (`**text**`)
- `combinedEmphasisExtension` - Combined bold/italic (`***text***`)
- `headingExtension` - Headings (`#`, `##`, etc.)
- `imageExtension` - Images (`![alt](url)`)
- `italicExtension` - Italic text (`*text*`)
- `linkExtension` - Links (`[text](url)`)
- `plainTextListExtension` - Ordered and unordered lists
- `scrollbarExtension` - Custom scrollbar styling
- `strikethroughExtension` - Strikethrough (`~~text~~`)

## Writing extensions

See [docs/extensions.md](docs/extensions.md) for the full extension API, including examples of pure logic extensions and React-based UI extensions.
