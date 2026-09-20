import { jsx as baseJsx, jsxs as baseJsxs } from "react/jsx-runtime";
import { localizeProps } from "./index";
export { Fragment } from "react/jsx-runtime";
export type { JSX } from "react/jsx-runtime";
export const jsx: typeof baseJsx = (type, props, key) =>
  baseJsx(type, localizeProps(type, props), key);
export const jsxs: typeof baseJsxs = (type, props, key) =>
  baseJsxs(type, localizeProps(type, props), key);
