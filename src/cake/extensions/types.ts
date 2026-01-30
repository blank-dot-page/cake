import type { CakeExtension } from "../editor/extension-types";

export type CakeExtensionBundle = {
  name: string;
  extensions: CakeExtension[];
};
