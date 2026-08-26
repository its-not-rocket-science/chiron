import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DocxPdfParserProvider, MAX_UPLOAD_SIZE_BYTES } from '$lib/providers/DocxPdfParserProvider';
import { PARSE_ERROR_MESSAGES, type ParseError } from '$lib/providers/FileParserProvider';
import { checkRateLimit } from '$lib/server/rateLimit';

const parser = new DocxPdfParserProvider();
const RATE_LIMIT = { requests: 30, windowMs: 10 * 60 * 1000 };

/**
 * Parses an uploaded .docx/.pdf lesson plan into plain text. Does not
 * create a Lesson — that happens once the caller has the extracted text,
 * via the same path a pasted lesson takes (docs/ARCHITECTURE.md Section 6).
 * Reachable without signing in, so rate-limited per IP (Prompt 11) as
 * basic protection against parsing-cost DoS, same approach as the
 * scoring endpoint.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const rateLimit = await checkRateLimit(
		`upload:${getClientAddress()}`,
		RATE_LIMIT.requests,
		RATE_LIMIT.windowMs
	);
	if (!rateLimit.allowed) {
		return json(
			{ error: { message: 'Too many upload requests. Please wait a bit and try again.' } },
			{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
		);
	}

	// Reject oversized uploads before reading the body into memory, when the
	// client sends a Content-Length header. This is a fast path, not the
	// real enforcement — a client can omit Content-Length (chunked transfer
	// encoding) and skip straight past it, which is what the streaming read
	// below actually guards against.
	const contentLength = request.headers.get('content-length');
	if (contentLength && Number(contentLength) > MAX_UPLOAD_SIZE_BYTES) {
		return errorResponse('file_too_large', 413);
	}

	const readResult = await readFormDataWithSizeCap(request);
	if (!readResult.ok)
		return errorResponse(readResult.error, readResult.error === 'file_too_large' ? 413 : 400);
	const { formData } = readResult;

	const file = formData.get('file');
	if (!(file instanceof File)) {
		return json(
			{ error: { code: 'unsupported_file_type', message: 'No file was uploaded.' } },
			{ status: 400 }
		);
	}

	const buffer = await file.arrayBuffer();
	const result = await parser.parse({
		buffer,
		mimeType: file.type,
		filename: file.name
	});

	if (!result.ok) {
		return errorResponse(result.error, 400);
	}

	return json({ text: result.text });
};

function errorResponse(code: ParseError, status: number) {
	return json({ error: { code, message: PARSE_ERROR_MESSAGES[code] } }, { status });
}

type ReadResult =
	{ ok: true; formData: FormData } | { ok: false; error: 'file_too_large' | 'corrupted_file' };

/**
 * Reads the request body as a stream and enforces MAX_UPLOAD_SIZE_BYTES
 * while reading, instead of via `request.formData()`, which buffers the
 * *entire* body in memory before we get a chance to check its size. That
 * matters specifically for a client that omits `Content-Length` (chunked
 * transfer encoding) — the check above never fires, and without this,
 * an attacker could send an arbitrarily large body and have it fully
 * buffered before `DocxPdfParserProvider` ever sees it (prompts.txt
 * Prompt C; docs/SECURITY.md Section 3).
 *
 * Aborts the underlying read (`reader.cancel()`) the moment the cap is
 * exceeded, rather than continuing to drain the socket — this is the
 * actual size *enforcement*; the bytes collected up to that point are
 * discarded, never handed to a parser. Once confirmed within the cap,
 * the collected bytes are handed to `Response#formData()` (the same
 * standard multipart parser `request.formData()` itself uses) rather
 * than hand-rolling multipart parsing, which would be its own source of
 * parsing bugs.
 */
async function readFormDataWithSizeCap(request: Request): Promise<ReadResult> {
	if (!request.body) return { ok: true, formData: new FormData() };

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;

		total += value.byteLength;
		if (total > MAX_UPLOAD_SIZE_BYTES) {
			await reader.cancel();
			return { ok: false, error: 'file_too_large' };
		}
		chunks.push(value);
	}

	const contentType = request.headers.get('content-type') ?? '';
	try {
		const formData = await new Response(new Blob(chunks as BlobPart[]), {
			headers: { 'content-type': contentType }
		}).formData();
		return { ok: true, formData };
	} catch {
		return { ok: false, error: 'corrupted_file' };
	}
}
