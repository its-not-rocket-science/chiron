import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { scoreLesson, UnknownSubjectProfileError } from '$lib/domain/scoreLesson';
import { DeepSeekScoringProvider } from '$lib/providers/DeepSeekScoringProvider';
import { ScoringError } from '$lib/providers/ScoringProvider';
import { checkRateLimit } from '$lib/server/rateLimit';

const RequestBodySchema = z.object({
	lessonText: z.string().min(1),
	subjectProfileId: z.string().min(1),
	/** Optional — supply the same id across a revise/resubmit to keep a version's score linked to it. Generated if omitted. */
	lessonVersionId: z.uuid().optional()
});

const RATE_LIMIT = { requests: 15, windowMs: 10 * 60 * 1000 };

/**
 * Scores a lesson (paste, upload-extracted text, or a revision) against
 * the three-pillar rubric (docs/ARCHITECTURE.md Section 5). This one
 * endpoint serves both the initial score and every subsequent
 * revise-and-resubmit — the caller compares the returned score against
 * whatever it got last time to render the before/after view; nothing is
 * persisted server-side yet (that lands with accounts/library in
 * Prompt 8). Reachable without signing in, and each call costs real LLM
 * API spend, so it's rate-limited per IP (Prompt 11, Postgres-backed
 * since Prompt 31 — see src/lib/server/rateLimit.ts).
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const rateLimit = await checkRateLimit(
		`score:${getClientAddress()}`,
		RATE_LIMIT.requests,
		RATE_LIMIT.windowMs
	);
	if (!rateLimit.allowed) {
		return json(
			{ error: { message: 'Too many scoring requests. Please wait a bit and try again.' } },
			{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: { message: 'Request body must be JSON.' } }, { status: 400 });
	}

	const parsedBody = RequestBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return json(
			{ error: { message: 'Invalid request.', issues: parsedBody.error.issues } },
			{ status: 400 }
		);
	}

	const { lessonText, subjectProfileId, lessonVersionId } = parsedBody.data;

	try {
		const provider = new DeepSeekScoringProvider();
		const result = await scoreLesson(provider, {
			lessonVersionId: lessonVersionId ?? randomUUID(),
			lessonText,
			subjectProfileId
		});
		return json(result);
	} catch (err) {
		if (err instanceof UnknownSubjectProfileError) {
			return json({ error: { message: err.message } }, { status: 400 });
		}
		if (err instanceof ScoringError) {
			return json({ error: { message: err.message } }, { status: 502 });
		}
		// Anything else (e.g. DEEPSEEK_API_KEY missing/misconfigured) is a
		// server-side setup problem, not something the caller can fix by
		// retrying — surface a generic message rather than leaking internals.
		// Log only the error's name/message, never the raw error object or
		// lesson text — a vendor SDK error can embed request context in its
		// message/cause chain, and this is the one place in the app that
		// logs on the request path a lesson plan travels through.
		const safeErrorSummary =
			err instanceof Error ? `${err.name}: ${err.message}` : 'non-Error thrown';
		console.error('Unexpected error scoring lesson:', safeErrorSummary);
		return json(
			{ error: { message: 'Scoring is temporarily unavailable. Please try again later.' } },
			{ status: 500 }
		);
	}
};
