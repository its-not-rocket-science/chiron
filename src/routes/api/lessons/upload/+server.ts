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
	const rateLimit = checkRateLimit(
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
	// client sends a Content-Length header.
	const contentLength = request.headers.get('content-length');
	if (contentLength && Number(contentLength) > MAX_UPLOAD_SIZE_BYTES) {
		return errorResponse('file_too_large', 413);
	}

	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		return errorResponse('corrupted_file', 400);
	}

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
