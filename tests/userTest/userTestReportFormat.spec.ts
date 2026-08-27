import { describe, expect, it } from 'vitest';
import { buildUserTestReport, type RawAttemptRow, type RawSessionRow } from './userTestReport';
import { formatMarkdown, formatText, toJson } from './userTestReportFormat';

const RAW_STUDENT_ID = 'aaaaaaaa-1111-2222-3333-444444444444';

function session(overrides: Partial<RawSessionRow> = {}): RawSessionRow {
	return {
		id: 's1',
		student_id: RAW_STUDENT_ID,
		case_id: 'causal-inference-1',
		fsm_state: 'COMPLETE',
		revealed_evidence_ids: [],
		transcript: [
			{
				action: { action: 'ASK_FOR_REASONING' },
				questionText: 'Why do you think that?',
				response: 'Because of the confounder.'
			}
		],
		initial_judgment: {
			judgment: 'uncertain',
			confidence: 50,
			reasoning: 'Initial reasoning text.'
		},
		update_criterion_text: 'New data on X would change my mind.',
		revised_judgment: {
			judgment: 'uncertain',
			confidence: 60,
			reasoning: 'Revised reasoning text.'
		},
		reflection_text: 'A reflection.',
		test_cohort: 'alpha-2026-08',
		created_at: '2026-08-27T00:00:00Z',
		...overrides
	};
}

function attempt(overrides: Partial<RawAttemptRow> = {}): RawAttemptRow {
	return {
		id: 'a1',
		student_id: RAW_STUDENT_ID,
		case_id: 'causal-inference-1',
		session_id: 's1',
		initial_judgment: { judgment: 'uncertain', confidence: 50, reasoning: 'x' },
		update_criterion: {
			text: 'New data on X would change my mind.',
			classification: null,
			consistency: { status: 'criterion_met_and_followed', explanation: 'You said X; X happened.' }
		},
		revised_judgment: { judgment: 'uncertain', confidence: 60, reasoning: 'y' },
		scoring_events: [
			{
				id: 'e1',
				attemptId: 'a1',
				ruleId: null,
				signal: 'names_confounder',
				affectedSkills: ['analysis'],
				explanation: 'Named the confounder explicitly.',
				evidenceQuote: 'the confounder',
				stage: 'SCORE_AND_RECORD',
				createdAt: '2026-08-27T00:00:00Z'
			}
		],
		initial_reasoning_signals: [],
		outcome: 'correct',
		created_at: '2026-08-27T00:00:00Z',
		...overrides
	};
}

function report() {
	return buildUserTestReport({
		cohort: 'alpha-2026-08',
		generatedAt: '2026-08-27T00:00:00Z',
		commitSha: 'abc123',
		dirty: false,
		sessions: [session()],
		attempts: [attempt()],
		checkins: [],
		feedback: [
			{
				id: 'f1',
				student_id: RAW_STUDENT_ID,
				test_cohort: 'alpha-2026-08',
				cases_understandable: 4,
				tutor_made_think: 4,
				new_evidence_meaningful: 4,
				tutor_repetitive: 2,
				confidence_understandable: 4,
				update_criterion_understandable: 'yes',
				perceived_steering: true,
				perceived_steering_explanation: 'It felt like it wanted a specific answer.',
				would_continue: true,
				what_worked_best: null,
				what_needs_changing: null,
				created_at: '2026-08-27T00:00:00Z'
			}
		]
	});
}

describe('formatText / toJson — no user-id leakage (Section 5)', () => {
	it('never includes the raw student_id in the text report, only the pseudonym', () => {
		const text = formatText(report());
		expect(text).not.toContain(RAW_STUDENT_ID);
		expect(text).toContain('Tester 001');
	});

	it('never includes the raw student_id in the JSON report, only the pseudonym', () => {
		const json = toJson(report());
		expect(json).not.toContain(RAW_STUDENT_ID);
		expect(json).toContain('Tester 001');
	});

	it('includes the raw transcript content the JSON is supposed to carry', () => {
		const json = toJson(report());
		const parsed = JSON.parse(json);
		expect(parsed.sessions[0].tester).toBe('Tester 001');
		expect(parsed.sessions[0].student_id).toBeUndefined();
		expect(parsed.attempts[0].tester).toBe('Tester 001');
	});

	it('renders the raw transcript section with judgment, reasoning, and scoring events', () => {
		const text = formatText(report());
		expect(text).toContain('Initial reasoning text.');
		expect(text).toContain('Revised reasoning text.');
		expect(text).toContain('Named the confounder explicitly.');
		expect(text).toContain('New data on X would change my mind.');
	});

	it('formatMarkdown produces a non-empty summary without raw ids either', () => {
		const markdown = formatMarkdown(report());
		expect(markdown).not.toContain(RAW_STUDENT_ID);
		expect(markdown).toContain('# Chiron Phase 2A User-Test Report');
	});
});
