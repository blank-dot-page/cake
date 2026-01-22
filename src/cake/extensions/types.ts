import type { ReactElement } from "react";

export type OverlayExtensionContext = {
  container: HTMLElement;
  insertText: (text: string) => void;
  replaceText: (oldText: string, newText: string) => void;
  getSelection: () => { start: number; end: number } | null;
  contentRoot?: HTMLElement;
  overlayRoot?: HTMLElement;
  toOverlayRect?: (rect: DOMRectReadOnly) => {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

export type OverlayExtension = {
  type: "overlay";
  name: string;
  render: (context: OverlayExtensionContext) => ReactElement | null;
};

export type Extension =
  | OverlayExtension
  | {
      type: "inline" | "block";
      name: string;
    };

export type BlockExtension = {
  type: "block";
  name: string;
};
