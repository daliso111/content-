/*
 * Module-resolution hooks for the Node test runner.
 *
 * Node strips TypeScript types natively, but it does not read tsconfig `paths`
 * and it requires explicit file extensions on relative imports. These hooks add
 * both so the tests can import application modules exactly as the app does
 * (`@/lib/...`), with no bundler and no extra dependency.
 */
import { registerHooks } from "node:module";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".json"];

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveFile(target) {
  const candidates = [
    target,
    ...EXTENSIONS.map((extension) => `${target}${extension}`),
    ...EXTENSIONS.map((extension) => path.join(target, `index${extension}`)),
  ];
  return candidates.find(isFile) ?? null;
}

function parentDirectory(parentURL) {
  if (!parentURL || !parentURL.startsWith("file:")) return null;
  const parentPath = fileURLToPath(parentURL);
  if (parentPath.includes(`${path.sep}node_modules${path.sep}`)) return null;
  if (!parentPath.startsWith(projectRoot)) return null;
  return path.dirname(parentPath);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = null;
    if (specifier.startsWith("@/")) {
      target = path.join(projectRoot, specifier.slice(2));
    } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const directory = parentDirectory(context.parentURL);
      if (directory) target = path.resolve(directory, specifier);
    }

    if (target) {
      const file = resolveFile(target);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
