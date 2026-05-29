/**
 * Lazy loader for the JP skill database.
 *
 * The v2 skill visualizer's bundle is built with the Global skill database
 * baked in (via the redirectData esbuild plugin in build.mjs). To support a
 * Global-vs-JP toggle on the skill cards, we fetch the JP data lazily on
 * first need and cache it for the rest of the session.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import type { SkillDataSource } from '../../v2/skills';

// Module-level Promise cache. After the first call, all callers share one fetch.
let cached: Promise<SkillDataSource> | null = null;

/**
 * Returns a Promise resolving to the JP skill data source. Subsequent calls
 * return the same Promise (data is fetched once per session). On failure the
 * cache resets so the next call retries.
 *
 * The `/uma-tools/` prefix is globally path-rewritten via `_redirects`
 * (line `/uma-tools/* /:splat 200`), so this URL resolves to the JP data
 * file at the repo root.
 */
export function loadJpSkillData(): Promise<SkillDataSource> {
	if (cached) return cached;

	const p = (async (): Promise<SkillDataSource> => {
		const [skillsResp, namesResp] = await Promise.all([
			fetch('/uma-tools/uma-skill-tools/data/skill_data.json'),
			fetch('/uma-tools/uma-skill-tools/data/skillnames.json'),
		]);
		if (!skillsResp.ok) throw new Error(`JP skill_data.json: HTTP ${skillsResp.status}`);
		if (!namesResp.ok)  throw new Error(`JP skillnames.json: HTTP ${namesResp.status}`);

		const [skills, skillnames] = await Promise.all([
			skillsResp.json(),
			namesResp.json(),
		]);

		// skillmeta has no JP-specific variant — it's GameTora-derived and Global-only.
		// Both views reuse the Global skillmeta for icons / display ordering.
		const { default: skillmeta } = await import('../../skill_meta.json');

		return { skills, skillnames, skillmeta } as SkillDataSource;
	})();

	cached = p;
	// Reset cache on failure so subsequent calls retry instead of replaying the rejection
	p.catch(() => { cached = null; });
	return p;
}

/**
 * Returns the cached JP source if already loaded, else null. Use for
 * synchronous fast-path rendering (avoids spinner flicker on re-renders).
 */
export function getJpSkillDataSync(): SkillDataSource | null {
	// We can't peek a Promise synchronously, but we can stash the resolved
	// value via a separate slot once load completes.
	return _resolved;
}

let _resolved: SkillDataSource | null = null;
export function primeJpCache(source: SkillDataSource) {
	_resolved = source;
}
