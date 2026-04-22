import type { Recipe } from '../types.js';
import { sunoRecipe } from './suno.js';

export const builtinRecipes: Record<string, Recipe<any, any>> = {
  suno: sunoRecipe,
};

export function listRecipes(): Array<{ name: string; description: string }> {
  return Object.values(builtinRecipes).map((r) => ({ name: r.name, description: r.description }));
}

export async function loadRecipe(nameOrPath: string): Promise<Recipe<any, any>> {
  const builtin = builtinRecipes[nameOrPath];
  if (builtin) return builtin;

  // External recipe — import the file and grab the default export or a named export matching the filename.
  const url = nameOrPath.startsWith('/') ? `file://${nameOrPath}` : nameOrPath;
  const mod = (await import(url)) as { default?: Recipe; [k: string]: unknown };
  if (mod.default) return mod.default;
  // Fallback: first exported object that quacks like a Recipe.
  for (const v of Object.values(mod)) {
    if (v && typeof v === 'object' && 'name' in v && 'run' in v) return v as Recipe;
  }
  throw new Error(`no Recipe export found in ${nameOrPath}`);
}
