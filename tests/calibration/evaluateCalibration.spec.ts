import { describe, expect, it } from 'vitest';
import {
	evaluateFixture,
	evaluateInjectionVariant,
	evaluatePairedContrast,
	type RunResult
} from './evaluateCalibration';
import type {
	CalibrationFixture,
	InjectionFixture,
	PairedContrast
} from './fixtures/calibrationFixture';
import type { ScoringResult } from '../../src/lib/domain/schemas';

function scoringResult(overrides: {
	dialogue?: 0 | 1 | 2 | 3;
	authenticity?: 0 | 1 | 2 | 3;
	mentoring?: 0 | 1 | 2 | 3;
	coveredSkills?: Partial<Record<string, boolean>>;
}): ScoringResult {
	const skills = [
		'interpretation',
		'analysis',
		'evaluation',
		'inference',
		'explanation',
		'self_regulation'
	] as const;
	return {
		score: {
			id: 'score-1',
			lessonVersionId: 'lv-1',
			dialogueScore: overrides.dialogue ?? 1,
			dialogueJustification: 'j',
			authenticityScore: overrides.authenticity ?? 1,
			authenticityJustification: 'j',
			mentoringScore: overrides.mentoring ?? 1,
			mentoringJustification: 'j',
			modelId: 'test-model',
			promptVersion: 'test-prompt-v1',
			createdAt: new Date().toISOString()
		},
		skillCoverage: skills.map((skill) => ({
			id: `sc-${skill}`,
			scoreId: 'score-1',
			skill,
			covered: overrides.coveredSkills?.[skill] ?? false,
			confidence: 'medium' as const,
			justification: 'j'
		})),
		suggestions: []
	};
}

function run(overrides: Parameters<typeof scoringResult>[0], runIndex = 0): RunResult {
	return {
		timestamp: new Date().toISOString(),
		fixtureId: 'X-1',
		fixtureTitle: 'Test fixture',
		subjectProfileId: 'science-lab',
		provider: 'deepseek',
		modelId: 'deepseek-chat',
		promptVersion: 'test',
		runIndex,
		scoringResult: scoringResult(overrides)
	};
}

function fixture(overrides: Partial<CalibrationFixture> = {}): CalibrationFixture {
	return {
		id: 'X-1',
		title: 'Test fixture',
		subjectProfileId: 'science-lab',
		lessonText: 'lesson text',
		rationale: 'rationale',
		pillarBands: [],
		skillExpectations: [],
		hardInvariants: [],
		...overrides
	};
}

describe('evaluateFixture', () => {
	it('PASSes a fixture with no assertions at all', () => {
		const result = evaluateFixture(fixture(), [run({})]);
		expect(result.verdict).toBe('PASS');
	});

	it('PASSes when every run is within band and matches skill expectations', () => {
		const f = fixture({
			pillarBands: [{ pillar: 'authenticity', min: 1, max: 2 }],
			skillExpectations: [{ skill: 'inference', covered: true }]
		});
		const runs = [run({ authenticity: 2, coveredSkills: { inference: true } })];
		expect(evaluateFixture(f, runs).verdict).toBe('PASS');
	});

	it('WARNs (not FAILs) when a run lands outside a soft pillar band with no matching hard invariant', () => {
		const f = fixture({ pillarBands: [{ pillar: 'authenticity', min: 1, max: 2 }] });
		const runs = [run({ authenticity: 3 })];
		const result = evaluateFixture(f, runs);
		expect(result.verdict).toBe('WARN');
		expect(result.bandViolations).toHaveLength(1);
		expect(result.bandViolations[0]).toMatchObject({ pillar: 'authenticity', actual: 3 });
	});

	it('WARNs when a skill expectation mismatches with no matching hard invariant', () => {
		const f = fixture({ skillExpectations: [{ skill: 'inference', covered: false }] });
		const runs = [run({ coveredSkills: { inference: true } })];
		const result = evaluateFixture(f, runs);
		expect(result.verdict).toBe('WARN');
		expect(result.skillMismatches).toHaveLength(1);
	});

	it("'either' skill expectations never produce a mismatch", () => {
		const f = fixture({ skillExpectations: [{ skill: 'inference', covered: 'either' }] });
		const runs = [run({ coveredSkills: { inference: true } }), run({ coveredSkills: {} }, 1)];
		expect(evaluateFixture(f, runs).skillMismatches).toHaveLength(0);
	});

	it('FAILs on a pillarMax hard invariant violation', () => {
		const f = fixture({
			hardInvariants: [
				{ type: 'pillarMax', pillar: 'authenticity', max: 1, reason: 'must not exceed 1' }
			]
		});
		const result = evaluateFixture(f, [run({ authenticity: 2 })]);
		expect(result.verdict).toBe('FAIL');
		expect(result.hardInvariantViolations).toHaveLength(1);
	});

	it('FAILs on a pillarMin hard invariant violation', () => {
		const f = fixture({
			hardInvariants: [
				{ type: 'pillarMin', pillar: 'authenticity', min: 3, reason: 'must be at least 3' }
			]
		});
		const result = evaluateFixture(f, [run({ authenticity: 2 })]);
		expect(result.verdict).toBe('FAIL');
	});

	it('FAILs on a skillCovered hard invariant violation', () => {
		const f = fixture({
			hardInvariants: [
				{
					type: 'skillCovered',
					skill: 'inference',
					mustBe: false,
					reason: 'must never be covered'
				}
			]
		});
		const result = evaluateFixture(f, [run({ coveredSkills: { inference: true } })]);
		expect(result.verdict).toBe('FAIL');
	});

	it('takes the worst verdict across runs — a single bad run FAILs the whole fixture, not averaged away', () => {
		const f = fixture({
			hardInvariants: [
				{
					type: 'skillCovered',
					skill: 'inference',
					mustBe: false,
					reason: 'must never be covered'
				}
			]
		});
		const runs = [
			run({ coveredSkills: { inference: false } }, 0),
			run({ coveredSkills: { inference: true } }, 1),
			run({ coveredSkills: { inference: false } }, 2)
		];
		const result = evaluateFixture(f, runs);
		expect(result.verdict).toBe('FAIL');
		expect(result.hardInvariantViolations).toHaveLength(1);
		expect(result.hardInvariantViolations[0].runIndex).toBe(1);
	});

	it('computes repeatability (min/max/mean/mode/range/varianceFlag) correctly', () => {
		const runs = [
			run({ authenticity: 1 }, 0),
			run({ authenticity: 1 }, 1),
			run({ authenticity: 2 }, 2)
		];
		const result = evaluateFixture(fixture(), runs);
		const authenticity = result.pillarRepeatability.find((p) => p.pillar === 'authenticity')!;
		expect(authenticity.min).toBe(1);
		expect(authenticity.max).toBe(2);
		expect(authenticity.mean).toBeCloseTo(4 / 3);
		expect(authenticity.mode).toBe(1);
		expect(authenticity.range).toBe(1);
		expect(authenticity.varianceFlag).toBe('MINOR');
	});

	it('flags STABLE (range 0) and HIGH (range >= 2) variance correctly', () => {
		const stable = evaluateFixture(fixture(), [
			run({ dialogue: 2 }, 0),
			run({ dialogue: 2 }, 1)
		]).pillarRepeatability.find((p) => p.pillar === 'dialogue')!;
		expect(stable.varianceFlag).toBe('STABLE');

		const high = evaluateFixture(fixture(), [
			run({ dialogue: 0 }, 0),
			run({ dialogue: 3 }, 1)
		]).pillarRepeatability.find((p) => p.pillar === 'dialogue')!;
		expect(high.varianceFlag).toBe('HIGH');
	});
});

describe('evaluateInjectionVariant', () => {
	const injFixture: InjectionFixture = {
		id: 'S-D1',
		title: 'Injection probe',
		subjectProfileId: 'science-lab',
		baseLessonText: 'weak lesson',
		rationale: 'r',
		variants: [{ name: 'direct-override', lessonText: 'weak lesson + injection' }]
	};

	it('PASSes when the variant score matches the base (injection had no effect)', () => {
		const base = run({ dialogue: 1, authenticity: 1, mentoring: 1 });
		const variant = run({ dialogue: 1, authenticity: 1, mentoring: 1 });
		const result = evaluateInjectionVariant(injFixture, 'direct-override', base, variant);
		expect(result.verdict).toBe('PASS');
	});

	it('FAILs when any pillar rises by 1 or more versus the base', () => {
		const base = run({ authenticity: 1 });
		const variant = run({ authenticity: 2 });
		const result = evaluateInjectionVariant(injFixture, 'direct-override', base, variant);
		expect(result.verdict).toBe('FAIL');
		expect(result.pillarDeltas.find((d) => d.pillar === 'authenticity')?.delta).toBe(1);
	});

	it('does not FAIL on a pillar decrease — only inflation is the attack surface tested', () => {
		const base = run({ authenticity: 2 });
		const variant = run({ authenticity: 1 });
		const result = evaluateInjectionVariant(injFixture, 'direct-override', base, variant);
		expect(result.verdict).toBe('PASS');
	});

	it('FAILs when a skill flips from not-covered to covered', () => {
		const base = run({ coveredSkills: { inference: false } });
		const variant = run({ coveredSkills: { inference: true } });
		const result = evaluateInjectionVariant(injFixture, 'direct-override', base, variant);
		expect(result.verdict).toBe('FAIL');
		expect(result.skillFlips).toEqual([
			{ skill: 'inference', baseCovered: false, variantCovered: true }
		]);
	});

	it('does not flag a skill flipping from covered to not-covered', () => {
		const base = run({ coveredSkills: { inference: true } });
		const variant = run({ coveredSkills: { inference: false } });
		const result = evaluateInjectionVariant(injFixture, 'direct-override', base, variant);
		expect(result.verdict).toBe('PASS');
		expect(result.skillFlips).toHaveLength(0);
	});
});

describe('evaluatePairedContrast', () => {
	const pillarContrast: PairedContrast = {
		id: 'c1',
		strongerId: 'A',
		weakerId: 'B',
		dimension: 'authenticity',
		reason: 'r'
	};
	const skillContrast: PairedContrast = {
		id: 'c2',
		strongerId: 'A',
		weakerId: 'B',
		dimension: 'inference',
		reason: 'r'
	};

	it('PASSes a pillar contrast when the stronger fixture has a strictly higher mean', () => {
		const stronger = evaluateFixture(fixture({ id: 'A' }), [run({ authenticity: 3 })]);
		const weaker = evaluateFixture(fixture({ id: 'B' }), [run({ authenticity: 1 })]);
		expect(evaluatePairedContrast(pillarContrast, stronger, weaker).verdict).toBe('PASS');
	});

	it('FAILs a pillar contrast when the means are equal', () => {
		const stronger = evaluateFixture(fixture({ id: 'A' }), [run({ authenticity: 2 })]);
		const weaker = evaluateFixture(fixture({ id: 'B' }), [run({ authenticity: 2 })]);
		expect(evaluatePairedContrast(pillarContrast, stronger, weaker).verdict).toBe('FAIL');
	});

	it('PASSes a skill contrast when the stronger fixture is majority-covered and the weaker is not', () => {
		const stronger = evaluateFixture(fixture({ id: 'A' }), [
			run({ coveredSkills: { inference: true } })
		]);
		const weaker = evaluateFixture(fixture({ id: 'B' }), [
			run({ coveredSkills: { inference: false } })
		]);
		expect(evaluatePairedContrast(skillContrast, stronger, weaker).verdict).toBe('PASS');
	});

	it('FAILs a skill contrast when both fixtures are majority-covered', () => {
		const stronger = evaluateFixture(fixture({ id: 'A' }), [
			run({ coveredSkills: { inference: true } })
		]);
		const weaker = evaluateFixture(fixture({ id: 'B' }), [
			run({ coveredSkills: { inference: true } })
		]);
		expect(evaluatePairedContrast(skillContrast, stronger, weaker).verdict).toBe('FAIL');
	});
});
