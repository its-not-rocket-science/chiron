/**
 * Minimal, hand-built .docx/.pdf binaries for parser tests — built at test
 * time rather than checked in as binary fixture files, so the test intent
 * (what text a file does/doesn't contain) stays readable in the spec.
 */
import JSZip from 'jszip';

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Builds a minimal but valid .docx containing a single paragraph of `text` (empty body if omitted). */
export async function buildMinimalDocx(text?: string): Promise<ArrayBuffer> {
	const body = text ? `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>` : '<w:p/>';
	const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}</w:body>
</w:document>`;

	const zip = new JSZip();
	zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
	zip.file('_rels/.rels', RELS_XML);
	zip.file('word/document.xml', documentXml);
	return zip.generateAsync({ type: 'arraybuffer' });
}

function escapePdfText(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Builds a minimal but valid single-page PDF whose content stream shows `text` (no text layer if omitted). */
export function buildMinimalPdf(text?: string): ArrayBuffer {
	const contentStream = text ? `BT /F1 24 Tf 10 700 Td (${escapePdfText(text)}) Tj ET` : '';

	const objects: Record<number, string> = {
		1: '<< /Type /Catalog /Pages 2 0 R >>',
		2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		3: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
		4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		5: `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`
	};

	let pdf = '%PDF-1.4\n';
	const offsets: number[] = [0];
	for (let i = 1; i <= 5; i++) {
		offsets[i] = pdf.length;
		pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
	}

	const xrefStart = pdf.length;
	pdf += 'xref\n0 6\n';
	pdf += '0000000000 65535 f \n';
	for (let i = 1; i <= 5; i++) {
		pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

	return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}
