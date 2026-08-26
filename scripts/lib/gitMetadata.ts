import { execSync } from 'node:child_process';

export interface GitMetadata {
	commitSha: string;
	dirty: boolean;
}

/** Best-effort — a script run outside a git checkout (rare, but possible in some CI contexts) gets `'unknown'`/`false` rather than crashing. */
export function readGitMetadata(): GitMetadata {
	try {
		const commitSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
		const status = execSync('git status --porcelain', { encoding: 'utf8' });
		return { commitSha, dirty: status.trim().length > 0 };
	} catch {
		return { commitSha: 'unknown', dirty: false };
	}
}
