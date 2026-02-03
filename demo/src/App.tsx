import { useMemo, useRef, useState } from "react";
import { CakeEditor, CakeEditorRef } from "@blankdotpage/cake/react";
import {
  bundledExtensionsWithoutImage,
  imageExtension,
  linkExtension,
  mentionExtension,
} from "@blankdotpage/cake";
import type { OnRequestLinkInput } from "@blankdotpage/cake";

type FontStyle = "sans" | "serif" | "mono";

type User = {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
};

type MentionUser = User & { label: string };

const USERS: User[] = [
  {
    id: "u_01",
    username: "alice",
    name: "Alice Nguyen",
    avatarUrl:
      "https://api.dicebear.com/9.x/thumbs/svg?seed=alice&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
  },
  {
    id: "u_02",
    username: "bob",
    name: "Bob Smith",
    avatarUrl:
      "https://api.dicebear.com/9.x/thumbs/svg?seed=bob&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
  },
  {
    id: "u_03",
    username: "carmen",
    name: "Carmen Lee",
    avatarUrl:
      "https://api.dicebear.com/9.x/thumbs/svg?seed=carmen&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
  },
  {
    id: "u_04",
    username: "devon",
    name: "Devon Patel",
    avatarUrl:
      "https://api.dicebear.com/9.x/thumbs/svg?seed=devon&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
  },
  {
    id: "u_05",
    username: "mina",
    name: "Mina Kim",
    avatarUrl:
      "https://api.dicebear.com/9.x/thumbs/svg?seed=mina&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf",
  },
];

const userById = new Map(USERS.map((u) => [u.id, u]));

async function requestLinkInput(): Promise<{
  text: string;
  url: string;
} | null> {
  const text = window.prompt("Link text:");
  if (!text) {
    return null;
  }
  const url = window.prompt("Link URL:");
  if (!url) {
    return null;
  }
  return { text, url };
}

const onRequestLinkInput: OnRequestLinkInput = async () => {
  return requestLinkInput();
};
export default function App() {
  const editorRef = useRef<CakeEditorRef>(null);
  const [value, setValue] = useState(
    "# Cake Demo\n\nTry **bold**, *italic*, ~~strike~~, <u>underline</u>, and [links](https://example.com).\n\nType @ to mention someone (social-style).",
  );
  const [spellCheck, setSpellCheck] = useState(false);
  const [fontStyle, setFontStyle] = useState<FontStyle>("sans");
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    affinity: "forward" | "backward";
  } | null>(null);

  const extensions = useMemo(() => {
    const extensionsWithoutLink = bundledExtensionsWithoutImage.filter(
      (ext) => ext !== linkExtension,
    );
    return [
      ...extensionsWithoutLink,
      linkExtension({ onRequestLinkInput }),
      imageExtension,
      mentionExtension<MentionUser>({
        getItems: async (query) => {
          // Simulate an async network call, so we exercise the cancellation logic.
          await new Promise<void>((resolve) =>
            window.setTimeout(() => resolve(), 120),
          );
          const q = query.trim().toLowerCase();
          if (!q) {
            return USERS.slice(0, 5).map((u) => ({
              ...u,
              label: u.username,
            }));
          }
          return USERS.filter((u) => {
            return (
              u.username.toLowerCase().includes(q) ||
              u.name.toLowerCase().includes(q)
            );
          }).map((u) => ({
            ...u,
            label: u.username,
          }));
        },
        renderItem: (item) => {
          const u = item as unknown as User & { label: string };
          return (
            <div className="demoMentionItem">
              <img
                className="demoMentionAvatar"
                src={u.avatarUrl}
                alt=""
                width={22}
                height={22}
              />
              <div className="demoMentionText">
                <div className="demoMentionName">{u.name}</div>
                <div className="demoMentionUsername">@{u.username}</div>
              </div>
            </div>
          );
        },
        decorateMentionElement: ({ element, mention }) => {
          // Example: hydrate additional attributes from the mention id.
          const u = userById.get(mention.id);
          element.classList.add("demoMention");
          element.setAttribute("data-demo-platform", "social");
          if (u) {
            element.setAttribute("data-user-name", u.name);
            element.setAttribute("data-user-username", u.username);
            element.setAttribute("data-user-avatar", u.avatarUrl);
          }
        },
        styles: {
          popover: "demoMentionPopover",
          popoverItem: "demoMentionPopoverItem",
          popoverItemActive: "demoMentionPopoverItemActive",
          mention: "demoMention",
        },
      }),
    ];
  }, []);

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
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-bold" },
                    { restoreFocus: true },
                  )
                }
                title="Bold (Cmd+B)"
                disabled={!hasSelection}
              >
                <strong>B</strong>
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-italic" },
                    { restoreFocus: true },
                  )
                }
                title="Italic (Cmd+I)"
                disabled={!hasSelection}
              >
                <em>I</em>
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-strikethrough" },
                    { restoreFocus: true },
                  )
                }
                title="Strikethrough (Cmd+Shift+X)"
                disabled={!hasSelection}
              >
                <s>S</s>
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-underline" },
                    { restoreFocus: true },
                  )
                }
                title="Underline (Cmd+U)"
                disabled={!hasSelection}
              >
                <u>U</u>
              </button>
              <button
                className="toolbarButton"
                onClick={async () => {
                  if (hasSelection) {
                    editorRef.current?.executeCommand(
                      { type: "wrap-link", openPopover: true },
                      { restoreFocus: true },
                    );
                  } else {
                    const result = await requestLinkInput();
                    if (result) {
                      editorRef.current?.executeCommand(
                        {
                          type: "insert",
                          text: `[${result.text}](${result.url})`,
                        },
                        { restoreFocus: true },
                      );
                    } else {
                      editorRef.current?.focus();
                    }
                  }
                }}
                title="Link (Cmd+Shift+U)"
              >
                Link
              </button>
            </div>
            <div className="toolbarDivider" />
            <div className="toolbarGroup">
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-heading" },
                    { restoreFocus: true },
                  )
                }
                title="Heading"
              >
                H1
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-blockquote" },
                    { restoreFocus: true },
                  )
                }
                title="Quote"
              >
                Quote
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-bullet-list" },
                    { restoreFocus: true },
                  )
                }
                title="Bullet List (Cmd+Shift+8)"
              >
                List
              </button>
              <button
                className="toolbarButton"
                onClick={() =>
                  editorRef.current?.executeCommand(
                    { type: "toggle-numbered-list" },
                    { restoreFocus: true },
                  )
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
                onClick={() => {
                  setFontStyle("sans");
                  editorRef.current?.focus();
                }}
                title="Sans-serif font"
              >
                Sans
              </button>
              <button
                className={`toolbarButton ${fontStyle === "serif" ? "active" : ""}`}
                onClick={() => {
                  setFontStyle("serif");
                  editorRef.current?.focus();
                }}
                title="Serif font"
              >
                Serif
              </button>
              <button
                className={`toolbarButton ${fontStyle === "mono" ? "active" : ""}`}
                onClick={() => {
                  setFontStyle("mono");
                  editorRef.current?.focus();
                }}
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
            extensions={extensions}
            scrollerStyle={{ padding: 24, paddingBottom: 224 }}
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
