// Lets Node resolve the game's "@/..." imports, as the import map in
// index.html does in the browser: "@/x.js" is build/src/x.js.
import { register } from "node:module";

const hooks = `
const src = new URL("../build/src/", ${JSON.stringify(import.meta.url)});
export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) return next(new URL(specifier.slice(2), src).href, context);
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
