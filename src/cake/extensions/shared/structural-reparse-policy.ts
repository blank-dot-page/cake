import type { CakeExtension } from "../../core/runtime";

const FAST_PATH_TEXT_PATTERN = /^[\p{L}\p{N}\p{M}]+$/u;

/**
 * Structural edits keep an incremental doc tree.
 * Reparse only when the inserted text is likely to carry syntax intent.
 */
export const structuralReparsePolicyExtension: CakeExtension = (editor) => {
  return editor.registerStructuralReparsePolicy((command) => {
    if (command.type !== "insert") {
      return true;
    }

    if (command.text.length === 0) {
      return true;
    }

    return !FAST_PATH_TEXT_PATTERN.test(command.text);
  });
};

