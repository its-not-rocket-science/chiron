import { z } from 'zod';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/**
 * Server-side environment schema. All Supabase/Anthropic keys are optional
 * at the *schema* level so local dev can boot without a Supabase project
 * or Anthropic key configured yet (see README "Local dev setup"). Callers
 * that actually need a value should use `requireEnv` below rather than
 * assuming presence.
 */
const serverSchema = z.object({
	PUBLIC_SUPABASE_URL: z.url().optional(),
	PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
	SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
	ANTHROPIC_API_KEY: z.string().min(1).optional(),
	DEEPSEEK_API_KEY: z.string().min(1).optional()
});

export type ServerEnv = z.infer<typeof serverSchema>;

/** Pure validation function, exported separately so it's testable without SvelteKit's env virtual modules. */
export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
	const result = serverSchema.safeParse(raw);

	if (!result.success) {
		throw new Error(
			`Invalid environment configuration: ${result.error.message}\n` +
				'Check .env against .env.example.'
		);
	}

	return result.data;
}

/** Validated environment, parsed once at first import. */
export const env: ServerEnv = parseServerEnv({
	PUBLIC_SUPABASE_URL: publicEnv.PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY: publicEnv.PUBLIC_SUPABASE_ANON_KEY,
	SUPABASE_SERVICE_ROLE_KEY: privateEnv.SUPABASE_SERVICE_ROLE_KEY,
	ANTHROPIC_API_KEY: privateEnv.ANTHROPIC_API_KEY,
	DEEPSEEK_API_KEY: privateEnv.DEEPSEEK_API_KEY
});

/** Thrown by `requireEnv` — a distinct type so callers can tell "not configured" apart from other failures. */
export class MissingEnvError extends Error {}

/**
 * Fetch a required env var, throwing a clear error naming the missing key
 * rather than letting a downstream call fail on `undefined`.
 */
export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
	const value = env[key];
	if (value === undefined || value === '') {
		throw new MissingEnvError(`Missing required environment variable: ${key} (see .env.example)`);
	}
	return value as NonNullable<ServerEnv[K]>;
}
