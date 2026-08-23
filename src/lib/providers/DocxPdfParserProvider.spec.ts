import { describe, expect, it } from 'vitest';
import {
	DocxPdfParserProvider,
	MAX_EXTRACTED_TEXT_LENGTH,
	MAX_UPLOAD_SIZE_BYTES
} from './DocxPdfParserProvider';
import { buildMinimalDocx, buildMinimalPdf } from './testFixtures';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_MIME = 'application/pdf';

describe('DocxPdfParserProvider', () => {
	const parser = new DocxPdfParserProvider();

	it('extracts text from a valid .docx', async () => {
		const buffer = await buildMinimalDocx('This is a real lesson about photosynthesis.');
		const result = await parser.parse({ buffer, mimeType: DOCX_MIME, filename: 'lesson.docx' });
		expect(result).toEqual({ ok: true, text: 'This is a real lesson about photosynthesis.' });
	});

	it('extracts text from a valid .pdf', async () => {
		const buffer = buildMinimalPdf('This is a real lesson about the French Revolution.');
		const result = await parser.parse({ buffer, mimeType: PDF_MIME, filename: 'lesson.pdf' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.text).toContain('This is a real lesson about the French Revolution.');
		}
	});

	it('normalizes whitespace the same way paste/type input would be', async () => {
		const buffer = await buildMinimalDocx('  Extra   spaces   here.  ');
		const result = await parser.parse({ buffer, mimeType: DOCX_MIME, filename: 'lesson.docx' });
		expect(result).toEqual({ ok: true, text: 'Extra spaces here.' });
	});

	it('returns no_text_layer for a PDF with no extractable text (e.g. a scanned image)', async () => {
		const buffer = buildMinimalPdf(); // empty content stream — no text layer
		const result = await parser.parse({ buffer, mimeType: PDF_MIME, filename: 'scanned.pdf' });
		expect(result).toEqual({ ok: false, error: 'no_text_layer' });
	});

	it('returns empty_file for an empty .docx body', async () => {
		const buffer = await buildMinimalDocx(); // empty paragraph, no text run
		const result = await parser.parse({ buffer, mimeType: DOCX_MIME, filename: 'lesson.docx' });
		expect(result).toEqual({ ok: false, error: 'empty_file' });
	});

	it('returns empty_file for a zero-byte upload', async () => {
		const result = await parser.parse({
			buffer: new ArrayBuffer(0),
			mimeType: PDF_MIME,
			filename: 'empty.pdf'
		});
		expect(result).toEqual({ ok: false, error: 'empty_file' });
	});

	it('returns unsupported_file_type for a non-docx/pdf file', async () => {
		const buffer = new TextEncoder().encode('just some text').buffer as ArrayBuffer;
		const result = await parser.parse({ buffer, mimeType: 'text/plain', filename: 'notes.txt' });
		expect(result).toEqual({ ok: false, error: 'unsupported_file_type' });
	});

	it('returns unsupported_file_type when extension and mime type disagree', async () => {
		const buffer = buildMinimalPdf('Some text');
		const result = await parser.parse({ buffer, mimeType: DOCX_MIME, filename: 'lesson.pdf' });
		expect(result).toEqual({ ok: false, error: 'unsupported_file_type' });
	});

	it('returns file_too_large for an oversized upload rather than attempting to parse it', async () => {
		const buffer = new ArrayBuffer(MAX_UPLOAD_SIZE_BYTES + 1);
		const result = await parser.parse({ buffer, mimeType: PDF_MIME, filename: 'huge.pdf' });
		expect(result).toEqual({ ok: false, error: 'file_too_large' });
	});

	it('returns corrupted_file for a file that is not actually a valid PDF, rather than crashing', async () => {
		const buffer = new TextEncoder().encode('this is not a real pdf, no header at all')
			.buffer as ArrayBuffer;
		const result = await parser.parse({ buffer, mimeType: PDF_MIME, filename: 'broken.pdf' });
		expect(result).toEqual({ ok: false, error: 'corrupted_file' });
	});

	it('returns corrupted_file for a file that is not actually a valid docx zip, rather than crashing', async () => {
		const buffer = new TextEncoder().encode('this is not a real docx, no zip structure')
			.buffer as ArrayBuffer;
		const result = await parser.parse({ buffer, mimeType: DOCX_MIME, filename: 'broken.docx' });
		expect(result).toEqual({ ok: false, error: 'corrupted_file' });
	});

	it('returns content_too_large for a decompression-bomb-style .docx — small on disk, huge once extracted', async () => {
		// Highly repetitive text compresses extremely well, so this .docx is
		// well under MAX_UPLOAD_SIZE_BYTES even though it decompresses to far
		// more text than any real lesson plan — exactly the case
		// MAX_EXTRACTED_TEXT_LENGTH exists to catch.
		const hugeText = 'a'.repeat(MAX_EXTRACTED_TEXT_LENGTH + 1);
		const buffer = await buildMinimalDocx(hugeText);
		expect(buffer.byteLength).toBeLessThan(MAX_UPLOAD_SIZE_BYTES);

		const result = await parser.parse({ buffer, mimeType: DOCX_MIME, filename: 'bomb.docx' });
		expect(result).toEqual({ ok: false, error: 'content_too_large' });
	});
});
