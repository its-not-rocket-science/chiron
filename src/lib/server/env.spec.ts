import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './env';

describe('parseServerEnv', () => {
	it('accepts an empty environment (local dev with no Supabase/Anthropic configured yet)', () => {
		expect(() => parseServerEnv({})).not.toThrow();
		const result = parseServerEnv({});
		expect(result.PUBLIC_SUPABASE_URL).toBeUndefined();
	});

	it('accepts a fully-configured environment', () => {
		const result = parseServerEnv({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
			PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
			SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
			ANTHROPIC_API_KEY: 'sk-ant-test'
		});
		expect(result.PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
	});

	it('rejects a malformed Supabase URL rather than silently accepting it', () => {
		expect(() => parseServerEnv({ PUBLIC_SUPABASE_URL: 'not-a-url' })).toThrow(
			/Invalid environment configuration/
		);
	});

	it('rejects an empty-string secret rather than treating it as unset', () => {
		expect(() => parseServerEnv({ ANTHROPIC_API_KEY: '' })).toThrow();
	});
});
