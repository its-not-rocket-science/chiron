/**
 * prompts.txt Prompt C — proves the chunked-encoding upload size bypass
 * is actually closed, not just that the code compiles. Builds a request
 * whose body is a streamed ReadableStream (no Content-Length header, the
 * same shape a chunked-transfer-encoding client sends) totaling well
 * over MAX_UPLOAD_SIZE_BYTES, and confirms:
 *   1. it's rejected with 413/file_too_large, and
 *   2. the stream was cancelled partway through, not drained to the end
 *      first — i.e. the cap is enforced *during* the read, not after
 *      buffering the whole oversized body.
 */
import { describe, expect, it } from 'vitest';
import { POST } from './+server';
import { MAX_UPLOAD_SIZE_BYTES } from '$lib/providers/DocxPdfParserProvider';

const CHUNK_SIZE = 1024 * 1024; // 1MB
const CHUNK_COUNT = Math.ceil(MAX_UPLOAD_SIZE_BYTES / CHUNK_SIZE) + 5; // well over the cap

function makeOversizedNoContentLengthRequest() {
	let pulled = 0;
	let cancelled = false;

	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (pulled >= CHUNK_COUNT) {
				controller.close();
				return;
			}
			pulled += 1;
			controller.enqueue(new Uint8Array(CHUNK_SIZE));
		},
		cancel() {
			cancelled = true;
		}
	});

	const request = new Request('http://localhost/api/lessons/upload', {
		method: 'POST',
		headers: { 'content-type': 'multipart/form-data; boundary=----test' },
		body: stream,
		duplex: 'half'
	} as RequestInit);

	// A chunked-encoding client never sends this — confirm our own test
	// fixture actually matches that shape, not just that we forgot to set it.
	expect(request.headers.get('content-length')).toBeNull();

	return { request, getPulled: () => pulled, getCancelled: () => cancelled };
}

describe('POST /api/lessons/upload — chunked-encoding size cap (Prompt C)', () => {
	it('rejects an oversized body with no Content-Length before draining the whole stream', async () => {
		const { request, getPulled, getCancelled } = makeOversizedNoContentLengthRequest();

		const response = await POST({
			request,
			getClientAddress: () => `test-chunked-cap-${Math.random()}`
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(413);
		const body = await response.json();
		expect(body.error.code).toBe('file_too_large');

		// The cap (10MB) is crossed partway through an 15MB+ stream — if the
		// implementation buffered the whole thing first, `pulled` would equal
		// CHUNK_COUNT. Enforcing the cap during the read stops well short.
		expect(getPulled()).toBeLessThan(CHUNK_COUNT);
		expect(getCancelled()).toBe(true);
	});
});
