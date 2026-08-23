import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';
import type { FileParserProvider, ParseError, ParseResult } from './FileParserProvider';

/** 10MB — generous for a lesson plan document, small enough to bound memory/cost per upload. */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Cap on *extracted* text length, independent of the compressed upload
 * size (Prompt 11 security review). A .docx is a zip archive — a small,
 * highly-compressible file can decompress to a huge amount of text (a
 * "decompression bomb"), and the 10MB check above only bounds the
 * compressed input. 500k characters is already far beyond any real
 * lesson plan (tens of pages), so this is a safety backstop, not a
 * realistic ceiling for legitimate use.
 */
export const MAX_EXTRACTED_TEXT_LENGTH = 500_000;

const DOCX_MIME_TYPES = new Set([
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const PDF_MIME_TYPES = new Set(['application/pdf']);

type FileKind = 'docx' | 'pdf';

/**
 * Resolves what kind of file this is from extension + mime type together.
 * Browsers sometimes send a generic mime type (e.g. `application/octet-stream`)
 * for these extensions, so the extension is treated as authoritative when the
 * mime type is missing or generic, but an extension/mime mismatch (a `.pdf`
 * that's actually reported as a `.docx` mime type) is rejected rather than
 * guessed at.
 */
function resolveFileKind(filename: string, mimeType: string): FileKind | null {
	const ext = filename.toLowerCase().split('.').pop();
	const genericMime = mimeType === '' || mimeType === 'application/octet-stream';

	if (ext === 'docx' && (genericMime || DOCX_MIME_TYPES.has(mimeType))) return 'docx';
	if (ext === 'pdf' && (genericMime || PDF_MIME_TYPES.has(mimeType))) return 'pdf';
	return null;
}

/** Collapse whitespace noise from extraction into the same shape as pasted lesson text. */
function normalizeLessonText(raw: string): string {
	return raw
		.replace(/\r\n/g, '\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function failure(error: ParseError): ParseResult {
	return { ok: false, error };
}

/**
 * Server-side .docx/.pdf lesson-plan parser (docs/ARCHITECTURE.md Section 4).
 * The uploaded binary is only ever held in memory for the duration of this
 * call — it's never written to disk or a persistent store, which is what
 * satisfies ADR-004 (discard the original after text extraction) without
 * needing an explicit cleanup step.
 */
export class DocxPdfParserProvider implements FileParserProvider {
	async parse(file: {
		buffer: ArrayBuffer;
		mimeType: string;
		filename: string;
	}): Promise<ParseResult> {
		if (file.buffer.byteLength === 0) return failure('empty_file');
		if (file.buffer.byteLength > MAX_UPLOAD_SIZE_BYTES) return failure('file_too_large');

		const kind = resolveFileKind(file.filename, file.mimeType);
		if (!kind) return failure('unsupported_file_type');

		try {
			const rawText =
				kind === 'pdf' ? await extractPdfText(file.buffer) : await extractDocxText(file.buffer);

			// Check before normalizing — normalization runs several regex
			// passes over the whole string, which we don't want to do on a
			// decompression-bomb-sized payload before rejecting it.
			if (rawText.length > MAX_EXTRACTED_TEXT_LENGTH) return failure('content_too_large');

			const text = normalizeLessonText(rawText);

			if (text.length === 0) {
				// A .docx is XML text under the hood — an empty result means the
				// document itself had no text content. A .pdf's most common cause
				// of an empty result is a scanned image with no text layer, which
				// needs a different fix from the user (re-type it / OCR it), so it
				// gets a distinct error rather than being lumped in with "empty".
				return failure(kind === 'pdf' ? 'no_text_layer' : 'empty_file');
			}

			return { ok: true, text };
		} catch {
			return failure('corrupted_file');
		}
	}
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
	const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
	return result.value;
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
	const pdf = await getDocumentProxy(new Uint8Array(buffer));
	const { text } = await extractText(pdf, { mergePages: true });
	return text;
}
