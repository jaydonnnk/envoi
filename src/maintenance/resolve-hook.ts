import { registerHooks } from "node:module";

// Loaded with `node --import` before the compiled maintenance runner (S5). The shared source uses
// the app's "@/..." alias and extensionless relative imports under bundler resolution, which Node
// does not resolve by itself. Inside the runner build only, this maps "@/x" to the built src/x.js
// and adds ".js" to an extensionless relative import. A bare package still resolves from
// node_modules, and nothing outside the build is rewritten.

const BUILD_SRC = new URL("../", import.meta.url).href;
const HAS_EXTENSION = /\.[cm]?js$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.js`, BUILD_SRC).href, context);
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (relative && !HAS_EXTENSION.test(specifier) && context.parentURL?.startsWith(BUILD_SRC)) return nextResolve(`${specifier}.js`, context);
    return nextResolve(specifier, context);
  },
});
