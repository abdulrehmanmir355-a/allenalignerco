import { isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stub = pathToFileURL(path.join(root, 'scripts', '_server-only-stub.cjs')).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: stub, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    let file = path.resolve(root, specifier.slice(2));
    if (!path.extname(file)) file += '.ts';
    return nextResolve(pathToFileURL(file).href, context);
  }
  if (!isBuiltin(specifier) && (specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    try {
      return await nextResolve(specifier + '.ts', context);
    } catch {
      return nextResolve(specifier, context);
    }
  }
  return nextResolve(specifier, context);
}
