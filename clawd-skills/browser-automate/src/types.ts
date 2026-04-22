import type { BrowserContext, Page } from 'playwright';

export interface RecipeContext {
  page: Page;
  context: BrowserContext;
  /** Emit progress on stderr (stdout is reserved for the final JSON result). */
  log: (msg: string) => void;
  /** Download a URL to a local path using the authenticated browser context's cookies. */
  downloadUrl: (url: string, destPath: string) => Promise<number>;
  /** Directory for recipe-local artifacts (screenshots on failure, intermediate files). */
  workDir: string;
}

export interface RecipeRunOptions {
  /** If true, operator will handle login manually in a visible browser. Recipe should detect logged-in state and wait. */
  loginMode: boolean;
  /** Force headful (visible) even when not in login mode. Useful for debugging. */
  headful: boolean;
  /** Per-recipe timeout in ms. Recipe may use shorter internal timeouts. */
  timeoutMs: number;
}

export interface Recipe<A = Record<string, unknown>, R = unknown> {
  /** Short identifier, lowercase, used on the CLI (e.g. "suno"). */
  name: string;
  /** Human description for --list output. */
  description: string;
  /** URL to visit in login mode for initial auth (or a function that returns it). */
  loginUrl?: string | ((args: A) => string);
  /** Check whether the current context is already logged in. Called at the start of run(). */
  isLoggedIn?: (ctx: RecipeContext) => Promise<boolean>;
  /** Main execution. Runs against the authenticated context. Returns anything JSON-serialisable. */
  run: (ctx: RecipeContext, args: A, opts: RecipeRunOptions) => Promise<R>;
  /** Optional argument schema description for --help / docs. */
  argsSchema?: Record<string, { type: 'string' | 'number' | 'boolean'; required?: boolean; description?: string }>;
}

export interface RecipeResult<R = unknown> {
  ok: boolean;
  recipe: string;
  data?: R;
  error?: string;
  durationMs: number;
  screenshots?: string[];
}
