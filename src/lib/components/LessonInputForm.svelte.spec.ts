import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LessonInputForm from './LessonInputForm.svelte';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('LessonInputForm', () => {
	it('submits the entered subject and lesson text', async () => {
		const onSubmit = vi.fn();
		const screen = await render(LessonInputForm, {
			lessonText: '',
			subjectProfileId: 'science-lab',
			onSubmit
		});

		await screen
			.getByLabelText('Lesson plan')
			.fill('Students collect real data from a pond sample.');
		await screen.getByRole('combobox', { name: 'Subject' }).selectOptions('history-essay');
		await screen.getByRole('button', { name: 'Score this lesson' }).click();

		expect(onSubmit).toHaveBeenCalledWith({
			lessonText: 'Students collect real data from a pond sample.',
			subjectProfileId: 'history-essay',
			source: 'paste'
		});
	});

	it('does not submit with empty lesson text', async () => {
		const onSubmit = vi.fn();
		const screen = await render(LessonInputForm, {
			lessonText: '',
			subjectProfileId: 'science-lab',
			onSubmit
		});

		await expect.element(screen.getByRole('button', { name: 'Score this lesson' })).toBeDisabled();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it('uploads a file and populates the lesson text field from the extracted text', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ text: 'Extracted lesson text from the file.' }), {
						status: 200
					})
			)
		);

		const onSubmit = vi.fn();
		const screen = await render(LessonInputForm, {
			lessonText: '',
			subjectProfileId: 'science-lab',
			onSubmit
		});

		const file = new File(['irrelevant content'], 'lesson.docx', {
			type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		});
		await screen.getByLabelText('Or upload a .docx / .pdf file').upload(file);

		await expect
			.element(screen.getByLabelText('Lesson plan'))
			.toHaveValue('Extracted lesson text from the file.');

		await screen.getByRole('button', { name: 'Score this lesson' }).click();
		expect(onSubmit).toHaveBeenCalledWith({
			lessonText: 'Extracted lesson text from the file.',
			subjectProfileId: 'science-lab',
			source: 'upload'
		});
	});

	it('shows a clear error when the upload fails, without touching the lesson text field', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: {
								code: 'no_text_layer',
								message: "We couldn't extract any text from this PDF."
							}
						}),
						{ status: 400 }
					)
			)
		);

		const screen = await render(LessonInputForm, {
			lessonText: '',
			subjectProfileId: 'science-lab',
			onSubmit: vi.fn()
		});

		const file = new File(['irrelevant content'], 'scanned.pdf', { type: 'application/pdf' });
		await screen.getByLabelText('Or upload a .docx / .pdf file').upload(file);

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent("We couldn't extract any text from this PDF.");
		await expect.element(screen.getByLabelText('Lesson plan')).toHaveValue('');
	});
});
