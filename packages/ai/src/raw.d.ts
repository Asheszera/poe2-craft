/**
 * Vite's `?raw` suffix returns a module's file contents as a string. TypeScript
 * needs to be told; `vite/client` would also declare this, but pulling the whole
 * Vite client types into a Node-only package for one declaration is not worth it.
 */
declare module '*.md?raw' {
  const content: string;
  export default content;
}
