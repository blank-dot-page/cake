import TurndownService from "turndown";

const MAX_HTML_INPUT_LENGTH = 500000;
const MAX_MARKDOWN_OUTPUT_LENGTH = 100000;

function isHTMLElement(node: Node | null): node is HTMLElement {
  return node !== null && node.nodeType === Node.ELEMENT_NODE;
}

function isElement(node: Node | null): node is Element {
  return node !== null && node.nodeType === Node.ELEMENT_NODE;
}

const CLEANUP_PATTERNS = {
  unescapeHeaders: /^\\(#{1,6})\s+/gm,
  unescapeBlockquote: /^\\>/gm,
  unescapeMarkdown: /\\([*_`~[\]])/g,
  unescapeListBullets: /^(\s*)\\([-*+])(\s+)/gm,
  unescapeListNumbers: /^(\s*)(\d+)\\\.(\s+)/gm,
  normalizeBullets: /^(\s*)[-*+](\s{2,})/gm,
  normalizeNumbers: /^[\s]*\d+\.[\s]+/gm,
  normalizeHeaders: /^(#{1,6})[\s]{2,}/gm,
  removeTrailingSpaces: /[ \t]+$/gm,
  headersInBlockquotes: /^>\s*(#{1,6}\s+.*)/gm,
  excessiveNewlines: /\n{3,}/g,
  interlacedTableGaps: /(\|[^\n]*\|)\s*\n\s*\n+\s*(\|[^\n]*\|)/g,
  complexTableGaps: /(\|[^\n]*\|)(\s*\n){2,}(\|[^\n]*\|)/g,
};

const HTML_PREPROCESSING_PATTERNS = {
  removeStyleAndDataAttrs: /\s(?:style|data-[^=]*|id)="[^"]*"/gi,
  removeNonCodeClasses: /\sclass="(?![^"]*(?:language-|hljs))[^"]*"/gi,
  removeEmptyElements: /<(\w+)[^>]*>\s*<\/\1>/gi,
  normalizeSpaces: /[ \t]{2,}/g,
  reduceBlankLines: /\n\s*\n/g,
};

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
  replacement: (content: string, node: Node) => {
    if (!isHTMLElement(node)) {
      return `\n\`\`\`\n${content}\n\`\`\`\n`;
    }
    const codeElement = node.querySelector("code");
    if (codeElement) {
      const className = codeElement.className || "";
      const languageMatch = className.match(/language-(\w+)/);
      const language = languageMatch ? languageMatch[1] : "";
      return `\n\`\`\`${language}\n${codeElement.textContent ?? ""}\n\`\`\`\n`;
    }
    return `\n\`\`\`\n${content}\n\`\`\`\n`;
  },
});

turndownService.addRule("tableRow", {
  filter: "tr",
  replacement: (_content: string, node: Node) => {
    if (!isHTMLElement(node)) {
      return "";
    }
    const isHeaderRow = node.parentNode?.nodeName === "THEAD";
    const cells = Array.from(node.querySelectorAll("td, th"));
    const cellContents = cells.map((cell) => {
      const text = cell.textContent || "";
      return text.replace(/\|/g, "\\|").trim();
    });

    let result = "| " + cellContents.join(" | ") + " |\n";

    if (isHeaderRow) {
      const separators = cells.map((cell) => {
        const align = cell.getAttribute("align");
        if (align === "center") {
          return ":-------------:";
        }
        if (align === "right") {
          return "-------------:";
        }
        return "-------------";
      });
      result += "| " + separators.join(" | ") + " |\n";
    }

    return result;
  },
});

turndownService.addRule("taskList", {
  filter: (node: Node) => {
    if (!isHTMLElement(node)) {
      return false;
    }
    if (node.nodeName !== "LI") {
      return false;
    }

    if (node.querySelector('input[type="checkbox"]') !== null) {
      return true;
    }

    const textContent = node.textContent || "";
    const hasCheckboxSymbols =
      /^[\s]*[☐☑✓✗[\]]/m.test(textContent) ||
      /^[\s]*\[[ x]\]/m.test(textContent);

    const hasCheckboxClass = Boolean(
      node.className &&
      (node.className.includes("task") ||
        node.className.includes("checkbox") ||
        node.className.includes("todo")),
    );

    return hasCheckboxSymbols || hasCheckboxClass;
  },
  replacement: (content: string, node: Node) => {
    if (!isHTMLElement(node)) {
      return content;
    }
    const checkbox = node.querySelector('input[type="checkbox"]');
    const isCheckbox =
      checkbox instanceof HTMLInputElement && checkbox.type === "checkbox";

    let isChecked = false;

    if (isCheckbox) {
      isChecked = checkbox.checked;
    } else {
      const textContent = node.textContent || "";
      isChecked =
        /^[\s]*[☑✓✗]/.test(textContent) || /^[\s]*\[x\]/i.test(textContent);
    }

    const prefix = isChecked ? "- [x] " : "- [ ] ";

    let textContent = content;
    textContent = textContent.replace(/^\s*\[[ x]\]\s*/gi, "");
    textContent = textContent.replace(/^\s*[☐☑✓✗]\s*/g, "");
    textContent = textContent.replace(/^\s*\[[x ]\]\s*/gi, "");
    textContent = textContent.replace(/^\s*\\?\[[ x]\\?\]\s*/gi, "");
    textContent = textContent.replace(/\\?\[\\?\s*\\?\]\\?\s*/g, "");

    return prefix + textContent.trim() + "\n";
  },
});

turndownService.addRule("list", {
  filter: ["ul", "ol"],
  replacement: (content: string, node: Node) => {
    const parent = node.parentNode;
    const isNested = isElement(parent) && parent.tagName === "LI";
    if (isNested) {
      return "\n" + content;
    }
    return "\n" + content + "\n";
  },
});

turndownService.addRule("blockquote", {
  filter: "blockquote",
  replacement: (content: string) => {
    const lines = content.trim().split("\n");
    const processedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return ">";
      }

      const existingQuotes = trimmed.match(/^(>\s*)+/);
      if (existingQuotes) {
        return existingQuotes[0] + " " + trimmed;
      }
      return "> " + trimmed;
    });

    return "\n" + processedLines.join("\n") + "\n";
  },
});

turndownService.addRule("horizontalRule", {
  filter: "hr",
  replacement: () => "\n---\n",
});

turndownService.addRule("inlineCode", {
  filter: (node: Node) => {
    const parent = node.parentNode;
    return (
      node.nodeName === "CODE" &&
      !(isElement(parent) && parent.tagName === "PRE")
    );
  },
  replacement: (content: string) => {
    const backtickCount = Math.max(
      1,
      (content.match(/`+/g) || []).reduce(
        (max: number, match: string) => Math.max(max, match.length),
        0,
      ) + 1,
    );
    const delimiter = "`".repeat(backtickCount);
    return delimiter + content + delimiter;
  },
});

turndownService.addRule("image", {
  filter: "img",
  replacement: (_content: string, node: Node) => {
    if (!isHTMLElement(node)) {
      return "";
    }
    const src = node.getAttribute("src") || "";
    const alt = node.getAttribute("alt") || "";
    const title = node.getAttribute("title");

    if (title) {
      return `![${alt}](${src} "${title}")`;
    }
    return `![${alt}](${src})`;
  },
});

turndownService.addRule("highlight", {
  filter: (node: Node) => {
    if (!isHTMLElement(node)) {
      return false;
    }
    return (
      node.nodeName === "MARK" ||
      (node.nodeName === "SPAN" &&
        (node.style?.backgroundColor === "yellow" ||
          node.className?.includes("highlight")))
    );
  },
  replacement: (content: string) => `==${content}==`,
});

turndownService.addRule("headerWithId", {
  filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
  replacement: (content: string, node: Node) => {
    if (!isHTMLElement(node)) {
      return content;
    }
    const rawLevel = parseInt(node.nodeName.charAt(1));
    const level = Math.min(rawLevel, 3);
    const hashes = "#".repeat(level);
    const id = node.getAttribute("id");

    if (id) {
      return `\n${hashes} ${content} {#${id}}\n`;
    }
    return `\n${hashes} ${content}\n`;
  },
});

function processTextNodes(element: Element) {
  const spans = Array.from(element.querySelectorAll("span"));

  spans.forEach((span) => {
    const textContent = span.textContent || "";
    const textNode = document.createTextNode(textContent);
    span.parentNode?.replaceChild(textNode, span);
  });
}

function detectSourceApp(html: string): string {
  const detectionPatterns: Record<string, string[]> = {
    notion: ["notion-", "notranslate"],
    github: ["github.com", "js-file-line-container"],
    slack: ["slack-", "c-message"],
    "google-docs": ["docs.google.com", "kix-"],
  };

  for (const [app, patterns] of Object.entries(detectionPatterns)) {
    if (patterns.some((pattern) => html.includes(pattern))) {
      return app;
    }
  }

  return "unknown";
}

function preprocessForApp(html: string, app: string): string {
  switch (app) {
    case "notion":
      return html
        .replace(/<div[^>]*class="[^"]*notion-[^"]*"[^>]*>/gi, "<div>")
        .replace(/<span[^>]*class="[^"]*notion-[^"]*"[^>]*>/gi, "<span>")
        .replace(/<details[^>]*>/gi, "<div>")
        .replace(/<\/details>/gi, "</div>")
        .replace(/<summary[^>]*>/gi, "<strong>")
        .replace(/<\/summary>/gi, "</strong>");

    case "github":
      return html
        .replace(/<td[^>]*class="[^"]*blob-num[^"]*"[^>]*>.*?<\/td>/gi, "")
        .replace(/<span[^>]*class="[^"]*pl-[^"]*"[^>]*>/gi, "<span>")
        .replace(/<span[^>]*class="[^"]*highlight[^"]*"[^>]*>/gi, "<span>");

    case "slack":
      return html
        .replace(/<span[^>]*class="[^"]*c-member[^"]*"[^>]*>/gi, "<span>")
        .replace(/<span[^>]*data-stringify-type="mention"[^>]*>/gi, "<span>")
        .replace(
          /<span[^>]*class="[^"]*c-emoji[^"]*"[^>]*>([^<]*)<\/span>/gi,
          "$1",
        );

    case "google-docs":
      return html
        .replace(
          /<span[^>]*style="[^"]*font-weight:[^;"]*bold[^"]*"[^>]*>/gi,
          "<strong>",
        )
        .replace(
          /<span[^>]*style="[^"]*font-style:[^;"]*italic[^"]*"[^>]*>/gi,
          "<em>",
        )
        .replace(/<\/span>/gi, "")
        .replace(/<p[^>]*style="[^"]*"[^>]*>/gi, "<p>");

    default:
      return html;
  }
}

function cleanupMarkdown(markdown: string): string {
  return (
    markdown
      .replace(CLEANUP_PATTERNS.unescapeHeaders, "$1 ")
      .replace(CLEANUP_PATTERNS.unescapeBlockquote, ">")
      .replace(CLEANUP_PATTERNS.unescapeMarkdown, "$1")
      .replace(CLEANUP_PATTERNS.unescapeListBullets, "$1$2$3")
      .replace(CLEANUP_PATTERNS.unescapeListNumbers, "$1$2.$3")
      .replace(CLEANUP_PATTERNS.normalizeBullets, "$1- ")
      .replace(CLEANUP_PATTERNS.normalizeNumbers, (match) => {
        const num = match.match(/\d+/)?.[0] || "1";
        return `${num}. `;
      })
      .replace(CLEANUP_PATTERNS.normalizeHeaders, "$1 ")
      .replace(CLEANUP_PATTERNS.removeTrailingSpaces, "")
      .replace(CLEANUP_PATTERNS.headersInBlockquotes, "\n$1")
      .replace(CLEANUP_PATTERNS.excessiveNewlines, "\n\n")
      .replace(CLEANUP_PATTERNS.interlacedTableGaps, "$1\n$2")
      .replace(CLEANUP_PATTERNS.complexTableGaps, "$1\n$3")
      // Keep inline formatting markers inside link labels
      .replace(/\*\*\[([^\]]+?)\]\(([^)]+?)\)\*\*/g, "[**$1**]($2)")
      .replace(/__\[([^\]]+?)\]\(([^)]+?)\)__/g, "[**$1**]($2)")
      .replace(/\*\[([^\]]+?)\]\(([^)]+?)\)\*/g, "[*$1*]($2)")
      .replace(/_\[([^\]]+?)\]\(([^)]+?)\)_/g, "[*$1*]($2)")
      .trim()
  );
}

function preprocessHtml(html: string): string {
  const sourceApp = detectSourceApp(html);
  let processedHtml = preprocessForApp(html, sourceApp);

  const parser = new DOMParser();
  const doc = parser.parseFromString(processedHtml, "text/html");

  if (doc.body) {
    processTextNodes(doc.body);
    processedHtml = doc.body.innerHTML;
  }

  return processedHtml
    .replace(HTML_PREPROCESSING_PATTERNS.removeStyleAndDataAttrs, "")
    .replace(HTML_PREPROCESSING_PATTERNS.removeNonCodeClasses, "")
    .replace(HTML_PREPROCESSING_PATTERNS.removeEmptyElements, "")
    .replace(HTML_PREPROCESSING_PATTERNS.normalizeSpaces, " ")
    .replace(HTML_PREPROCESSING_PATTERNS.reduceBlankLines, "\n\n")
    .trim();
}

function sanitizeContent(content: string): string {
  return content
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(
      /<(?:iframe|object|embed)[^>]*>.*?<\/(?:iframe|object|embed)>/gi,
      "",
    );
}

function limitContentLength(
  content: string,
  maxLength = MAX_MARKDOWN_OUTPUT_LENGTH,
) {
  return content.substring(0, maxLength);
}

function sanitizeMarkdown(markdown: string): string {
  return limitContentLength(sanitizeContent(markdown));
}

function shouldProcessPaste(htmlContent: string): boolean {
  if (htmlContent.length > MAX_HTML_INPUT_LENGTH) {
    console.warn("HTML content too large for paste processing");
    return false;
  }

  const hasFormatting =
    /<(?:strong|b|em|i|u|s|del|strike|code|pre|h[1-6]|blockquote|ul|ol|li|table|tr|td|th|a|img|mark|span|div)[\s>]/i.test(
      htmlContent,
    );

  if (!hasFormatting) {
    return false;
  }

  // Images are self-closing and have no text content, so allow them
  if (/<img\s/i.test(htmlContent)) {
    return true;
  }

  const strippedContent = htmlContent.replace(/<[^>]*>/g, "").trim();
  if (!strippedContent || strippedContent.length < 3) {
    return false;
  }

  return true;
}

function normalizeListPrefixes(content: string): string {
  const lines = content.split("\n");
  let currentListType: "bullet" | "numbered" | null = null;
  let currentNumber = 1;

  return lines
    .map((line) => {
      const match = line.match(/^(\s*)([-*+]|\d+\.)( +)(.*)$/);
      if (match) {
        const [, indent, marker, , listContent] = match;

        if (currentListType === null) {
          currentListType = /\d+\./.test(marker) ? "numbered" : "bullet";
        }

        const newMarker =
          currentListType === "bullet" ? "-" : `${currentNumber}.`;
        if (currentListType === "numbered") {
          currentNumber += 1;
        }

        return `${indent}${newMarker} ${listContent}`;
      }
      return line;
    })
    .join("\n");
}

function convertHtmlToMarkdown(html: string): string {
  try {
    const processedHtml = preprocessHtml(html);
    const markdown = turndownService.turndown(processedHtml);
    return cleanupMarkdown(markdown);
  } catch (error) {
    console.error("Error converting HTML to markdown:", error);
    return "";
  }
}

export function htmlToMarkdownForPaste(htmlContent: string): string | null {
  if (!shouldProcessPaste(htmlContent)) {
    return null;
  }

  const markdown = convertHtmlToMarkdown(htmlContent);
  if (!markdown.trim()) {
    return null;
  }

  const normalizedMarkdown = normalizeListPrefixes(markdown);
  return sanitizeMarkdown(normalizedMarkdown).replace(/\r\n?/g, "\n");
}
