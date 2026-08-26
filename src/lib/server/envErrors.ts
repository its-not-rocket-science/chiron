/**
 * `MissingEnvError` lives in its own file, separate from `env.ts`,
 * deliberately: `env.ts` imports SvelteKit's `$env/dynamic/private`/
 * `$env/dynamic/public` virtual modules, which only resolve inside
 * SvelteKit's own Vite pipeline. `llmScoringCore.ts`/`classifierCore.ts`/
 * `tutorCore.ts` only need this class for an `instanceof` check (never
 * call anything that reads an env var directly) — importing it from
 * `env.ts` pulled the `$env` dependency into otherwise-portable
 * provider-core code, which broke running that code from a plain Node
 * script outside SvelteKit (the scorer-calibration CLI,
 * `chiron_calibration_feedback_and_automation_prompts.txt` Prompt M4 —
 * see `scripts/run-scorer-calibration.ts`). `env.ts` re-exports this so
 * no other call site needs to change.
 */
export class MissingEnvError extends Error {}
