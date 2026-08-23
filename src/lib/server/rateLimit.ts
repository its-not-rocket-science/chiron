/**
 * In-memory sliding-window rate limiter (Prompt 11 — cost-abuse
 * prevention on LLM-calling and file-parsing endpoints, both reachable
 * without signing in). Deliberately simple: no external store, just a
 * per-process Map.
 *
 * Known limitation, accepted for now (see docs/SECURITY.md): this state
 * is per server instance and resets on restart, so it does not protect a
 * horizontally-scaled multi-instance deployment or survive a redeploy. A
 * shared store (e.g. Redis) is the real fix once the hosting target
 * (docs/ARCHITECTURE.md Section 11, open question 2) is decided —
 * tracked in ADR-006 alongside the rest of the rate-limiting decision.
 */

interface Bucket {
	timestamps: number[];
}

const buckets = new Map<string, Bucket>();

/** Bound the map itself so an attacker rotating IPs can't grow it unboundedly. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
	allowed: boolean;
	/** Seconds until the caller should retry, only meaningful when `allowed` is false. */
	retryAfterSeconds?: number;
}

/**
 * Returns whether `key` (e.g. an IP address, optionally combined with a
 * route name) is within `limit` requests per `windowMs`.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	let bucket = buckets.get(key);

	if (!bucket) {
		if (buckets.size >= MAX_TRACKED_KEYS) {
			evictOldest();
		}
		bucket = { timestamps: [] };
		buckets.set(key, bucket);
	}

	bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

	if (bucket.timestamps.length >= limit) {
		const oldest = bucket.timestamps[0];
		const retryAfterMs = windowMs - (now - oldest);
		return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
	}

	bucket.timestamps.push(now);
	return { allowed: true };
}

function evictOldest() {
	const firstKey = buckets.keys().next().value;
	if (firstKey !== undefined) buckets.delete(firstKey);
}
