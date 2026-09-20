import { jsxDEV as base } from "react/jsx-dev-runtime";
import { localizeProps } from "./index";
export { Fragment } from "react/jsx-dev-runtime";
export type { JSX } from "react/jsx-dev-runtime";
export const jsxDEV: typeof base = (type, props, key, isStatic, source, self) =>
  base(type, localizeProps(type, props), key, isStatic, source, self);
