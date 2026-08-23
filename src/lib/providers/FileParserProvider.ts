/**
 * Provider-independent file-parsing interface (docs/ARCHITECTURE.md
 * Section 4). Implemented in Prompt 4 (docx/pdf text extraction).
 * Declared now so upload-handling routes are written against this
 * interface, not a specific parsing library.
 */
export interface FileParserProvider {
	parse(file: { buffer: ArrayBuffer; mimeType: string; filename: string }): Promise<ParseResult>;
}

export type ParseResult = { ok: true; text: string } | { ok: false; error: ParseError };

export type ParseError =
	| 'unsupported_file_type'
	| 'file_too_large'
	| 'corrupted_file'
	| 'empty_file'
	| 'no_text_layer'
	| 'content_too_large';

/** User-facing copy for each failure mode — distinct messages, not one generic "upload failed". */
export const PARSE_ERROR_MESSAGES: Record<ParseError, string> = {
	unsupported_file_type:
		'Only .docx and .pdf files are supported. Please upload one of those, or paste the lesson text directly.',
	file_too_large:
		'This file is too large. Please upload a file under 10MB, or paste the lesson text directly.',
	corrupted_file:
		"We couldn't read this file — it may be corrupted. Try re-saving it, or paste the lesson text directly.",
	empty_file: 'This file appears to be empty. Please check the file and try again.',
	no_text_layer:
		"We couldn't extract any text from this PDF — it may be a scanned image with no text layer. Try an OCR tool, or paste the lesson text directly.",
	content_too_large:
		"This file contains far more text than a lesson plan should — we couldn't process it. Please paste the relevant lesson text directly instead."
};
