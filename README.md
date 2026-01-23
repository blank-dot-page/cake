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

```tsx
import { CakeEditor, defaultEditorSettings } from "@blankdotpage/cake";
```
