import type { StateCommand } from "@codemirror/state";
import { EditorSelection, Transaction } from "@codemirror/state";

// Markdown formatting command for bold
export const toggleBold: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const isBoldBefore = state.sliceDoc(range.from - 2, range.from) === "**";
    const isBoldAfter = state.sliceDoc(range.to, range.to + 2) === "**";
    const changes = [];

    // Remove or add ** before selection
    changes.push(
      isBoldBefore
        ? {
            from: range.from - 2,
            to: range.from,
            insert: "",
          }
        : {
            from: range.from,
            insert: "**",
          },
    );

    // Remove or add ** after selection
    changes.push(
      isBoldAfter
        ? {
            from: range.to,
            to: range.to + 2,
            insert: "",
          }
        : {
            from: range.to,
            insert: "**",
          },
    );

    // Calculate new cursor positions
    const extendBefore = isBoldBefore ? -2 : 2;
    const extendAfter = isBoldAfter ? -2 : 2;

    return {
      changes,
      range: EditorSelection.range(
        range.from + extendBefore,
        range.to + extendAfter,
      ),
    };
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for italic
export const toggleItalic: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const isItalicBefore = state.sliceDoc(range.from - 1, range.from) === "*";
    const isItalicAfter = state.sliceDoc(range.to, range.to + 1) === "*";
    const changes = [];

    // Remove or add * before selection
    changes.push(
      isItalicBefore
        ? {
            from: range.from - 1,
            to: range.from,
            insert: "",
          }
        : {
            from: range.from,
            insert: "*",
          },
    );

    // Remove or add * after selection
    changes.push(
      isItalicAfter
        ? {
            from: range.to,
            to: range.to + 1,
            insert: "",
          }
        : {
            from: range.to,
            insert: "*",
          },
    );

    // Calculate new cursor positions
    const extendBefore = isItalicBefore ? -1 : 1;
    const extendAfter = isItalicAfter ? -1 : 1;

    return {
      changes,
      range: EditorSelection.range(
        range.from + extendBefore,
        range.to + extendAfter,
      ),
    };
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for underline (using HTML <u> tags)
export const toggleUnderline: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const isUnderlineBefore =
      state.sliceDoc(range.from - 3, range.from) === "<u>";
    const isUnderlineAfter = state.sliceDoc(range.to, range.to + 4) === "</u>";
    const changes = [];

    // Remove or add <u> before selection
    changes.push(
      isUnderlineBefore
        ? {
            from: range.from - 3,
            to: range.from,
            insert: "",
          }
        : {
            from: range.from,
            insert: "<u>",
          },
    );

    // Remove or add </u> after selection
    changes.push(
      isUnderlineAfter
        ? {
            from: range.to,
            to: range.to + 4,
            insert: "",
          }
        : {
            from: range.to,
            insert: "</u>",
          },
    );

    // Calculate new cursor positions
    const extendBefore = isUnderlineBefore ? -3 : 3;
    const extendAfter = isUnderlineAfter ? -4 : 4;

    return {
      changes,
      range: EditorSelection.range(
        range.from + extendBefore,
        range.to + extendAfter,
      ),
    };
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for strikethrough
export const toggleStrikethrough: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const isStrikethroughBefore =
      state.sliceDoc(range.from - 2, range.from) === "~~";
    const isStrikethroughAfter =
      state.sliceDoc(range.to, range.to + 2) === "~~";
    const changes = [];

    // Remove or add ~~ before selection
    changes.push(
      isStrikethroughBefore
        ? {
            from: range.from - 2,
            to: range.from,
            insert: "",
          }
        : {
            from: range.from,
            insert: "~~",
          },
    );

    // Remove or add ~~ after selection
    changes.push(
      isStrikethroughAfter
        ? {
            from: range.to,
            to: range.to + 2,
            insert: "",
          }
        : {
            from: range.to,
            insert: "~~",
          },
    );

    // Calculate new cursor positions
    const extendBefore = isStrikethroughBefore ? -2 : 2;
    const extendAfter = isStrikethroughAfter ? -2 : 2;

    return {
      changes,
      range: EditorSelection.range(
        range.from + extendBefore,
        range.to + extendAfter,
      ),
    };
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for link
export const toggleLink: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const changes = [];
    const selectedText = state.sliceDoc(range.from, range.to);

    // Check if the selected text is already a markdown link [text](url)
    const linkRegex = /^\[([^\]]*)\]\(([^)]*)\)$/;
    const linkMatch = selectedText.match(linkRegex);

    if (linkMatch) {
      // If it's already a link, remove the link formatting and keep just the text
      const linkText = linkMatch[1];
      changes.push({
        from: range.from,
        to: range.to,
        insert: linkText,
      });

      return {
        changes,
        range: EditorSelection.range(range.from, range.from + linkText.length),
      };
    } else {
      // If it's not a link, add link formatting
      // Add [ before selection
      changes.push({
        from: range.from,
        insert: "[",
      });

      // Add ]() after selection
      changes.push({
        from: range.to,
        insert: "]()",
      });

      // Calculate new cursor position (inside the parentheses)
      const newCursorPos = range.to + 3; // After '[originalText]()'

      return {
        changes,
        range: EditorSelection.cursor(newCursorPos), // Place cursor inside ()
      };
    }
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for heading
export const toggleHeading: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineText = line.text;

    // Check if line already has heading prefix (# followed by space)
    const headingMatch = lineText.match(/^(\s*)# /);
    const changes = [];

    if (headingMatch) {
      // Remove heading prefix
      const indentLength = headingMatch[1].length;
      changes.push({
        from: line.from + indentLength,
        to: line.from + indentLength + 2, // Remove "# "
        insert: "",
      });

      // Adjust cursor position (move back by 2 characters)
      const cursorOffset = Math.max(0, range.from - line.from - 2);
      return {
        changes,
        range: EditorSelection.cursor(line.from + indentLength + cursorOffset),
      };
    } else {
      // Add heading prefix
      const indentMatch = lineText.match(/^(\s*)/);
      const indentLength = indentMatch ? indentMatch[1].length : 0;

      changes.push({
        from: line.from + indentLength,
        insert: "# ",
      });

      // Adjust cursor position (move forward by 2 characters)
      const cursorOffset = range.from - line.from;
      return {
        changes,
        range: EditorSelection.cursor(
          line.from + indentLength + 2 + cursorOffset,
        ),
      };
    }
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for subheading
export const toggleSubheading: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineText = line.text;

    // Check if line already has subheading prefix (## followed by space)
    const subheadingMatch = lineText.match(/^(\s*)## /);
    const changes = [];

    if (subheadingMatch) {
      // Remove subheading prefix
      const indentLength = subheadingMatch[1].length;
      changes.push({
        from: line.from + indentLength,
        to: line.from + indentLength + 3, // Remove "## "
        insert: "",
      });

      // Adjust cursor position (move back by 3 characters)
      const cursorOffset = Math.max(0, range.from - line.from - 3);
      return {
        changes,
        range: EditorSelection.cursor(line.from + indentLength + cursorOffset),
      };
    } else {
      // Add subheading prefix
      const indentMatch = lineText.match(/^(\s*)/);
      const indentLength = indentMatch ? indentMatch[1].length : 0;

      changes.push({
        from: line.from + indentLength,
        insert: "## ",
      });

      // Adjust cursor position (move forward by 3 characters)
      const cursorOffset = range.from - line.from;
      return {
        changes,
        range: EditorSelection.cursor(
          line.from + indentLength + 3 + cursorOffset,
        ),
      };
    }
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for inline code
export const toggleInlineCode: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const isCodeBefore = state.sliceDoc(range.from - 1, range.from) === "`";
    const isCodeAfter = state.sliceDoc(range.to, range.to + 1) === "`";
    const changes = [];

    // Remove or add ` before selection
    changes.push(
      isCodeBefore
        ? {
            from: range.from - 1,
            to: range.from,
            insert: "",
          }
        : {
            from: range.from,
            insert: "`",
          },
    );

    // Remove or add ` after selection
    changes.push(
      isCodeAfter
        ? {
            from: range.to,
            to: range.to + 1,
            insert: "",
          }
        : {
            from: range.to,
            insert: "`",
          },
    );

    // Calculate new cursor positions
    const extendBefore = isCodeBefore ? -1 : 1;
    const extendAfter = isCodeAfter ? -1 : 1;

    return {
      changes,
      range: EditorSelection.range(
        range.from + extendBefore,
        range.to + extendAfter,
      ),
    };
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for quote
export const toggleQuote: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const lineText = line.text;

    // Check if line already has quote prefix (> followed by space)
    const quoteMatch = lineText.match(/^(\s*)> /);
    const changes = [];

    if (quoteMatch) {
      // Remove quote prefix
      const indentLength = quoteMatch[1].length;
      changes.push({
        from: line.from + indentLength,
        to: line.from + indentLength + 2, // Remove "> "
        insert: "",
      });

      // Adjust cursor position (move back by 2 characters)
      const cursorOffset = Math.max(0, range.from - line.from - 2);
      return {
        changes,
        range: EditorSelection.cursor(line.from + indentLength + cursorOffset),
      };
    } else {
      // Add quote prefix
      const indentMatch = lineText.match(/^(\s*)/);
      const indentLength = indentMatch ? indentMatch[1].length : 0;

      changes.push({
        from: line.from + indentLength,
        insert: "> ",
      });

      // Adjust cursor position (move forward by 2 characters)
      const cursorOffset = range.from - line.from;
      return {
        changes,
        range: EditorSelection.cursor(
          line.from + indentLength + 2 + cursorOffset,
        ),
      };
    }
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Regex to match list items (from list-handling.ts)
const LIST_LINE_REGEX = /^(\s*)([-*+]|(\d+)\.)(\s+)(.*)/;

// Markdown formatting command for bullet list
export const toggleBulletList: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const changes = [];

    // No selection - insert bullet at cursor
    if (range.from === range.to) {
      // Just insert "-" at cursor position
      changes.push({
        from: range.from,
        insert: "-",
      });

      return {
        changes,
        range: EditorSelection.cursor(range.from + 1),
      };
    }

    // Selection exists - convert lines to bullet list
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    let rangeDelta = 0;

    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      const lineText = line.text;
      const match = lineText.match(LIST_LINE_REGEX);

      if (match) {
        const [, indent, , numberPart, space] = match;

        if (numberPart) {
          // Convert numbered list to bullet list
          const prefixLength =
            indent.length + numberPart.length + 1 + space.length;
          const newPrefix = `${indent}- `;
          changes.push({
            from: line.from,
            to: line.from + prefixLength,
            insert: newPrefix,
          });
          rangeDelta += newPrefix.length - prefixLength;
        }
        // If already bullet list, do nothing
      } else {
        // Not a list line, add bullet
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        changes.push({
          from: line.from + indent.length,
          insert: "- ",
        });
        rangeDelta += 2;
      }
    }

    return {
      changes,
      range: EditorSelection.range(range.from, range.to + rangeDelta),
    };
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};

// Markdown formatting command for numbered list
export const toggleNumberedList: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const changes = [];

    // No selection - insert "1. " at cursor
    if (range.from === range.to) {
      // Just insert "1. " at cursor position
      changes.push({
        from: range.from,
        insert: "1. ",
      });

      return {
        changes,
        range: EditorSelection.cursor(range.from + 3),
      };
    }

    // Selection exists - convert lines to numbered list
    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    let listNumber = 1;
    let rangeDelta = 0;

    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      const lineText = line.text;
      const match = lineText.match(LIST_LINE_REGEX);

      if (match) {
        const [, indent, bullet, numberPart, space] = match;

        if (!numberPart) {
          // Convert bullet list to numbered list
          const prefixLength = indent.length + bullet.length + space.length;
          const newPrefix = `${indent}${listNumber}. `;
          changes.push({
            from: line.from,
            to: line.from + prefixLength,
            insert: newPrefix,
          });
          rangeDelta += newPrefix.length - prefixLength;
          listNumber++;
        } else {
          // Already numbered, renumber sequentially
          const prefixLength =
            indent.length + numberPart.length + 1 + space.length;
          const newPrefix = `${indent}${listNumber}. `;
          changes.push({
            from: line.from,
            to: line.from + prefixLength,
            insert: newPrefix,
          });
          rangeDelta += newPrefix.length - prefixLength;
          listNumber++;
        }
      } else {
        // Not a list line, add numbered list item
        const indentMatch = lineText.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : "";
        const newPrefix = `${listNumber}. `;
        changes.push({
          from: line.from + indent.length,
          insert: newPrefix,
        });
        rangeDelta += newPrefix.length;
        listNumber++;
      }
    }

    return {
      changes,
      range: EditorSelection.range(range.from, range.to + rangeDelta),
    };
  });

  dispatch(
    state.update(changes, {
      scrollIntoView: true,
      annotations: Transaction.userEvent.of("input"),
    }),
  );

  return true;
};
