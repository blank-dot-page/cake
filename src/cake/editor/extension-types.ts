import type { ComponentType } from "react";
import type { CakeEditor } from "./cake-editor";

export type CakeExtension = (editor: CakeEditor) => void | (() => void);

export type CakeUIComponent = ComponentType<{ editor: CakeEditor }>;
