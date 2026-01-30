# Cake Extensions v2 (No Backwards Compatibility)

This document describes the **new extensions system** and how **all existing built-in extensions** were migrated. The previous object-shaped extensions API (including `defineExtension`, `renderOverlay`, and `OverlayExtensionContext`) is **removed**.

## What Changed (Breaking)

- Extensions are no longer objects (`{ name, parseInline, ... }`).
- `defineExtension(...)` is removed.
- `renderOverlay(...)` and `OverlayExtensionContext` are removed.
- `runtime.extensions` is removed (DOM rendering no longer consumes extension objects).

## New Extension Shape

An extension is a single function:

```ts
import type { CakeExtension } from "…/core/runtime";

export const myExtension: CakeExtension = (host) => {
  // register capabilities
  return () => {
    // optional teardown (unregister handlers, unmount UI, etc.)
  };
};
```

Extensions register behavior through `host`:

- `host.register*` — parsing, serialization, normalization, edit middleware, paste handlers, keybindings
- `host.registerInlineRenderer` / `host.registerBlockRenderer` — DOM renderers for blocks/inlines
- `host.registerUI` — mount React UI (overlays/popovers/etc.)

## Registration API

Use these registration calls (each returns an **unregister** function):

- `host.registerParseBlock(fn)`
- `host.registerParseInline(fn)`
- `host.registerSerializeBlock(fn)`
- `host.registerSerializeInline(fn)`
- `host.registerNormalizeBlock(fn)`
- `host.registerNormalizeInline(fn)`
- `host.registerOnEdit(fn)`
- `host.registerOnPasteText(fn)`
- `host.registerKeybindings(bindings)`
- `host.registerInlineWrapperAffinity(specs)`
- `host.registerToggleInline({ kind, markers })`

## DOM Rendering API

Register DOM renderers (each returns an **unregister** function):

- `host.registerInlineRenderer(fn)`
- `host.registerBlockRenderer(fn)`

These replace `extension.renderInline` / `extension.renderBlock`.

## UI Mounting API (Overlays, Popovers, React-only Extensions)

Mount a React component:

```ts
host.registerUI(MyUIComponent);
```

Mounted UI components receive the editor instance:

```ts
import type { CakeEditorUI } from "…/core/runtime";

function MyUIComponent({ editor }: { editor: CakeEditorUI }) {
  const container = editor.getContainer();
  const contentRoot = editor.getContentRoot();
  if (!contentRoot) return null;
  // …
}
```

Cake’s React wrapper renders mounted UI via a portal into the editor’s overlay root (see `src/cake/react/index.tsx`).

## Using Extensions

### Engine (non-React)

```ts
import { CakeEditor } from "…/editor/cake-editor";
import { bundledExtensions } from "…/extensions";

new CakeEditor({
  container,
  value: "",
  extensions: bundledExtensions,
});
```

### React

```tsx
import { CakeEditor } from "…/cake/react";
import { bundledExtensions } from "…/cake/extensions";

<CakeEditor value={value} onChange={setValue} extensions={bundledExtensions} />;
```

## Migration Map (Old → New)

Old extension property → new registration

- `parseBlock` → `host.registerParseBlock`
- `parseInline` → `host.registerParseInline`
- `serializeBlock` → `host.registerSerializeBlock`
- `serializeInline` → `host.registerSerializeInline`
- `normalizeBlock` → `host.registerNormalizeBlock`
- `normalizeInline` → `host.registerNormalizeInline`
- `onEdit` → `host.registerOnEdit`
- `onPasteText` → `host.registerOnPasteText`
- `keybindings` → `host.registerKeybindings`
- `inlineWrapperAffinity` → `host.registerInlineWrapperAffinity`
- `toggleInline` → `host.registerToggleInline`
- `renderBlock` → `host.registerBlockRenderer`
- `renderInline` → `host.registerInlineRenderer`
- `renderOverlay` → `host.registerUI(Component)`

## Built-in Extensions: Completed Migration

All built-ins under `src/cake/extensions/` were migrated to the new API:

- `blockquote` — registers `onEdit`, `parseBlock`, `serializeBlock`, block renderer
- `heading` — registers `onEdit`, `parseBlock`, `serializeBlock`, `normalizeBlock`, block renderer
- `list` — registers `onEdit`, `keybindings`, block renderer
- `bold`, `italic`, `strikethrough`, `underline` — register toggle markers, affinities, keybindings, edit middleware, parse/serialize/normalize, inline renderers
- `combined-emphasis` — registers a parse-only inline rule that yields nested wrappers
- `image` — registers `parseBlock`, `serializeBlock`, `normalizeBlock`, block renderer
- `link` — registers parse/serialize/normalize + edit/paste + inline renderer, and mounts `CakeLinkPopover` via `host.registerUI`
- `scrollbar` — mounts a React UI component via `host.registerUI`

## Runtime / DOM Rendering Notes

- `Runtime.dom` is now the authoritative DOM renderer registry.
- DOM rendering (`src/cake/dom/render.ts`) consumes `Runtime["dom"]`, not extension objects.
