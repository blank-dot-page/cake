# Cake Extensions

An extension is a function that receives the editor and registers capabilities.

```ts
import type { CakeExtension } from "../core/runtime";

export const myExtension: CakeExtension = (editor) => {
  const disposers: Array<() => void> = [];

  disposers.push(editor.registerKeybindings([...]));
  disposers.push(editor.registerOnEdit((command, state) => { ... }));

  return () => disposers.reverse().forEach((d) => d());
};
```

## Registration API

Each method returns an unregister function.

### Parsing & Serialization

```ts
editor.registerParseBlock(fn);
editor.registerParseInline(fn);
editor.registerSerializeBlock(fn);
editor.registerSerializeInline(fn);
editor.registerNormalizeBlock(fn);
editor.registerNormalizeInline(fn);
```

### Edit Handling

```ts
editor.registerOnEdit((command, state) => EditResult | EditCommand | null)
editor.registerOnPasteText((text, state) => EditCommand | null)
editor.registerKeybindings([{ key, meta?, ctrl?, alt?, shift?, command }])
```

### Inline Formatting Helpers

```ts
editor.registerToggleInline({ kind: "bold", markers: ["**"] });
editor.registerInlineWrapperAffinity([{ kind: "bold", inclusive: true }]);
```

### DOM Rendering

```ts
editor.registerInlineRenderer((inline, context) => Node | Node[] | null)
editor.registerBlockRenderer((block, context) => Node | Node[] | null)
```

### UI Components

```ts
editor.registerUI(MyComponent);
```

## Editor Methods

Available to extensions and UI components:

```ts
editor.getValue()                    // Get markdown source
editor.getSelection()                // Get current selection
editor.getLines()                    // Get document lines
editor.getFocusRect()                // Get caret rectangle
editor.getContainer()                // Get container element
editor.getContentRoot()              // Get contentEditable element
editor.executeCommand(command)       // Execute an edit command
editor.insertText(text)              // Insert text at cursor
editor.replaceText(old, new)         // Replace text in document
editor.onChange(callback)            // Subscribe to content changes
editor.onSelectionChange(callback)   // Subscribe to selection changes
```

## Example: Non-React Extension

A pure logic extension that adds bold formatting:

```ts
import type { CakeExtension, EditCommand } from "../core/runtime";

export const boldExtension: CakeExtension = (editor) => {
  const disposers: Array<() => void> = [];

  // Register toggle helper for **bold** syntax
  disposers.push(
    editor.registerToggleInline({ kind: "bold", markers: ["**"] }),
  );

  // Register keyboard shortcut
  disposers.push(
    editor.registerKeybindings([
      { key: "b", meta: true, command: { type: "toggle-bold" } },
    ]),
  );

  // Handle the toggle-bold command
  disposers.push(
    editor.registerOnEdit((command) => {
      if (command.type === "toggle-bold") {
        return { type: "toggle-inline", marker: "**" } as EditCommand;
      }
      return null;
    }),
  );

  // Parse **bold** syntax
  disposers.push(
    editor.registerParseInline((source, start, end, context) => {
      if (source.slice(start, start + 2) !== "**") return null;
      const close = source.indexOf("**", start + 2);
      if (close === -1 || close >= end) return null;

      return {
        inline: {
          type: "inline-wrapper",
          kind: "bold",
          children: context.parseInline(source, start + 2, close),
        },
        nextPos: close + 2,
      };
    }),
  );

  // Render bold as <strong>
  disposers.push(
    editor.registerInlineRenderer((inline, context) => {
      if (inline.type !== "inline-wrapper" || inline.kind !== "bold") {
        return null;
      }
      const el = document.createElement("strong");
      for (const child of inline.children) {
        for (const node of context.renderInline(child)) {
          el.append(node);
        }
      }
      return el;
    }),
  );

  return () => disposers.reverse().forEach((d) => d());
};
```

## Example: React Extension with UI

For extensions that need complex UI (popovers, pickers, dialogs), we recommend implementing them as React components from the start. The pattern is:

1. Register a React component via `editor.registerUI()`
2. Use `useEffect` to subscribe to editor state (content, selection)
3. Manage all UI state and rendering inside the component

This approach keeps UI logic self-contained and avoids mixing imperative DOM manipulation with React's declarative model. Non-React extensions work well for simpler features like keybindings, syntax parsing, or inline formatting toggles.

An extension that mounts a React component for UI overlays:

```tsx
import { useEffect, useState } from "react";
import type { CakeExtension } from "../core/runtime";
import type { CakeEditor } from "../editor/cake-editor";

function EmojiPicker({ editor }: { editor: CakeEditor }) {
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    return editor.onChange((value, selection) => {
      // Check if cursor is after a colon trigger like ":sm"
      const text = value.slice(0, selection.start);
      const match = text.match(/:(\w*)$/);

      if (match) {
        setVisible(true);
        setFilter(match[1]);
      } else {
        setVisible(false);
      }
    });
  }, [editor]);

  if (!visible) return null;

  const emojis = filterEmojis(filter);
  const rect = editor.getFocusRect();

  return (
    <div style={{ position: "absolute", top: rect?.top, left: rect?.left }}>
      {emojis.map((emoji) => (
        <button
          key={emoji.name}
          onClick={() => {
            editor.replaceText(`:${filter}`, emoji.char);
            setVisible(false);
          }}
        >
          {emoji.char}
        </button>
      ))}
    </div>
  );
}

export const emojiExtension: CakeExtension = (editor) => {
  const disposers: Array<() => void> = [];

  disposers.push(editor.registerUI(EmojiPicker));

  return () => disposers.reverse().forEach((d) => d());
};
```

## Using Extensions

### Vanilla

```ts
import { CakeEditor } from "../editor/cake-editor";
import { bundledExtensions } from "../extensions";

new CakeEditor({
  container,
  value: "",
  extensions: bundledExtensions,
});
```

### React

```tsx
import { CakeEditor } from "../react";
import { bundledExtensions } from "../extensions";

<CakeEditor value={value} onChange={setValue} extensions={bundledExtensions} />;
```

## More Examples

See `src/cake/extensions/` for complete implementations:

- `bold/bold.ts` - Inline formatting with toggle, keybindings, parse/serialize
- `link/link.tsx` - Inline with UI popover for editing URLs
- `scrollbar/index.tsx` - UI-only extension (no document logic)
- `heading/heading.ts` - Block-level extension
- `list/list.ts` - Block with keybindings and edit handling
