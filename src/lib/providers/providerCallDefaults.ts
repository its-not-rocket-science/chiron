/**
 * Shared network-call defense-in-depth for every DeepSeek-backed
 * provider (`prompts.txt` Prompt 32 — "timeout for provider calls;
 * retry count capped"). The `openai` SDK's own defaults are far looser
 * than this app wants: a 10-minute request timeout
 * (`node_modules/openai/client.js`'s `DEFAULT_TIMEOUT`), and up to 2
 * silent SDK-level retries on top of whatever retry logic
 * `tutorCore.ts`/`classifierCore.ts`/`llmScoringCore.ts` already do at
 * the semantic level (re-asking the model after a schema-validation
 * failure). Left at the defaults, a single classification or challenge
 * request could silently balloon into up to 3 real HTTP attempts (1 +
 * up to 2 SDK-level retries) per application-level attempt, each able
 * to hang for up to 10 minutes — undermining both "capped retries" and
 * "timeout" at once, and tying up a request handler far longer than
 * any interactive flow should.
 *
 * `PROVIDER_MAX_RETRIES: 0` makes each `*Core.ts` module's own
 * `MAX_ATTEMPTS` retry loop the *only* retry mechanism in play, so it's
 * the whole truth about how many real calls one operation can cost, not
 * a lower bound the SDK can silently exceed underneath it.
 */
export const PROVIDER_TIMEOUT_MS = 30_000;
export const PROVIDER_MAX_RETRIES = 0;
