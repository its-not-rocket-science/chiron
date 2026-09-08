/**
 * License badge text, keyed off the `LessonLicense` enum (Prompt E2) —
 * never string-matched from a free-text field, per that schema's own
 * doc comment. Pure data, no Svelte — rendered by
 * `LicenseBadge.svelte` (Prompt E4).
 */
import type { LessonLicense } from './schemas';

export interface LicenseBadgeInfo {
	/** Shown in the badge itself — short, e.g. "CC BY 4.0". */
	shortLabel: string;
	/** Full name, shown as a tooltip/title. */
	label: string;
}

const LICENSE_BADGES: Record<LessonLicense, LicenseBadgeInfo> = {
	'CC-BY-4.0': {
		shortLabel: 'CC BY 4.0',
		label: 'Creative Commons Attribution 4.0'
	},
	'CC-BY-SA-4.0': {
		shortLabel: 'CC BY-SA 4.0',
		label: 'Creative Commons Attribution-ShareAlike 4.0'
	},
	'Public-Domain-US-Govt': {
		shortLabel: 'Public Domain (U.S. Government)',
		label: 'Public Domain — U.S. Government Work'
	},
	'Public-Domain-Expired': {
		shortLabel: 'Public Domain (Expired Copyright)',
		label: 'Public Domain — Copyright Expired'
	},
	'Other-Permission-Granted': {
		shortLabel: 'Used With Permission',
		label: 'Used With Permission From the Rights Holder'
	}
};

export function licenseBadge(license: LessonLicense): LicenseBadgeInfo {
	return LICENSE_BADGES[license];
}
