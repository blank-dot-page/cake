import TurndownService from "turndown";

const turndownService = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
  linkReferenceStyle: "full",
});

turndownService.addRule("strikethrough", {
  filter: ["del", "s"],
  replacement: (content: string) => `~~${content}~~`,
});

turndownService.addRule("codeBlock", {
  filter: "pre",
  replacement: (content: string, node: HTMLElement) => {
    const codeElement = node.querySelector("code");
    if (codeElement) {
      const className = codeElement.className || "";
      const languageMatch = className.match(/language-(\w+)/);
      const language = languageMatch ? languageMatch[1] : "";
      return `\n\
\`\`\`${language}\n${codeElement.textContent ?? ""}\n\`\`\`\n`;
    }
    return `\n\
\`\`\`\n${content}\n\`\`\`\n`;
  },
});

export function htmlToMarkdownForPaste(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) {
    return "";
  }
  return turndownService.turndown(trimmed);
}
