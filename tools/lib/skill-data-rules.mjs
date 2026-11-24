/**
 * Safety and merge rules for umalator-global's skill data, shared by every tool that
 * writes it (tools/sync-upstream-data.mjs, tools/ingest-master-mdb.mjs). They were
 * learned the hard way; keep them in one place so the tools cannot drift apart.
 *
 *   1. skill_data.json is a JP SUPERSET over the Global-live set. Only entries the
 *      incoming source also has may be updated; JP-only entries are never touched, no
 *      entry is ever removed, and the key count may never shrink.
 *   2. The scenario skills in X12_SKILLS (23 IDs between 210011 and 210291) carry
 *      make_skill_data.pl's patch_modifier() x1.2. Sources ship the unpatched values,
 *      so syncing them would silently cut those magnitudes ~17%. Their effects are
 *      skipped, and each must be an exact 1.2 ratio of the incoming value so a genuine
 *      change can't hide in that set. Their tags/wisdomCheck are still refreshed.
 *      The other scenario skills in that ID range (210091-210141) are NOT patched and
 *      merge like any other skill.
 *   3. Names: our extra search aliases (entries [1..]) and "(obsolete)" markers are
 *      never stripped; only the display name (entry [0]) is refreshed.
 */

export class GuardError extends Error {
	constructor(message) { super(message); this.name = 'GuardError'; }
}

export const SCENARIO_FIRST = 210011, SCENARIO_LAST = 210291;
export const isScenarioSkill = id => +id >= SCENARIO_FIRST && +id <= SCENARIO_LAST;

// Exactly the IDs make_skill_data.pl's patch_modifier() multiplies.
export const X12_FACTOR = 1.2;
export const X12_SKILLS = new Set([
	210011, 210012, 210021, 210022, 210031, 210032, 210041, 210042, 210051, 210052,  // Aoharu
	210061, 210062,  // Make A New Track
	210071, 210072,  // Grand Live
	210081, 210082,  // updated URA
	210261, 210262, 210271, 210272, 210281, 210282,  // Grand Masters
	210291  // RFTS
].map(String));

/** Comparison key for "did the definition change" (ignores formatting and key order). */
export const normSkill = s => JSON.stringify({rarity: s.rarity, alts: (s.alternatives ?? []).map(x => ({
	c: x.condition ?? '', p: x.precondition ?? '', d: x.baseDuration, ds: x.durationScaling ?? 1,
	e: (x.effects ?? []).map(e => [e.type, e.modifier, e.target ?? null, e.scaling ?? null]).sort()}))});

/** Stricter key: also covers tags and wisdomCheck (used when the source is the full mdb record). */
export const exactSkill = s => JSON.stringify({n: normSkill(s), tags: s.tags ?? null, w: s.wisdomCheck ?? null});

const shape = alts => JSON.stringify(alts.map(a => ({c: a.condition ?? '', p: a.precondition ?? '',
	d: a.baseDuration, ds: a.durationScaling ?? 1, e: (a.effects ?? []).map(e => [e.type, e.target ?? null])})));

/** Throws GuardError unless ours is exactly incoming with every modifier x1.2. */
export function checkX12(id, incoming, ours) {
	const A = incoming.alternatives ?? [], O = ours.alternatives ?? [];
	if (shape(A) !== shape(O)) throw new GuardError(`scenario skill ${id} differs structurally, not just by the x1.2 patch`);
	A.forEach((a, i) => (a.effects ?? []).forEach((e, j) => {
		const r = O[i]?.effects?.[j]?.modifier / e.modifier;
		if (!(Math.abs(r - X12_FACTOR) <= 1e-9)) throw new GuardError(`scenario skill ${id} effect ${j} ratio ${r}, expected exactly 1.2`);
	}));
}

/** Copy of an unpatched definition with the x1.2 patch applied (only for X12_SKILLS). */
export function applyX12(id, skill) {
	if (!X12_SKILLS.has(String(id))) return skill;
	const out = structuredClone(skill);
	for (const a of out.alternatives ?? []) for (const e of a.effects ?? [])
		e.modifier = Math.round(e.modifier * X12_FACTOR * 1e6) / 1e6;
	return out;
}

/**
 * Merge incoming (unpatched) definitions into ours. Never removes, never touches IDs the
 * incoming set lacks, skips (and verifies) the x1.2 scenario skills' effects.
 * @param {'norm'|'exact'} compare  'exact' also treats tags/wisdomCheck changes as drift
 * @returns {{data, updated: string[], added: string[], skipped: string[], before: number, after: number}}
 *   updated also lists x1.2 skills whose tags/wisdomCheck were refreshed (effects kept).
 */
export function mergeSkillData(ours, incoming, {compare = 'norm'} = {}) {
	const key = compare === 'exact' ? exactSkill : normSkill;
	const data = structuredClone(ours);
	const before = Object.keys(data).length;
	const isX12 = k => X12_SKILLS.has(String(k));

	const drift = Object.keys(incoming).filter(k => k in data && key(incoming[k]) !== key(data[k]));
	const updated = drift.filter(k => !isX12(k));
	const skipped = drift.filter(isX12);
	for (const k of skipped) checkX12(k, incoming[k], data[k]);

	const added = Object.keys(incoming).filter(k => !(k in data));
	for (const k of updated) data[k] = incoming[k];
	for (const k of added) data[k] = applyX12(k, incoming[k]);

	// x1.2 skills: effects stay patched, but tags/wisdomCheck come from the source.
	if (compare === 'exact') for (const k of skipped) {
		let changed = false;
		for (const f of ['tags', 'wisdomCheck']) {
			if (!(f in incoming[k]) || JSON.stringify(incoming[k][f]) === JSON.stringify(data[k][f])) continue;
			data[k][f] = structuredClone(incoming[k][f]);
			changed = true;
		}
		if (changed) updated.push(k);
	}

	const after = Object.keys(data).length;
	if (after < before) throw new GuardError(`skill_data key count shrank (${before} -> ${after})`);
	for (const k of Object.keys(ours)) if (!(k in data)) throw new GuardError(`skill_data entry ${k} would be removed`);
	return {data, updated, added, skipped, before, after};
}

export const isObsoleteName = entry => Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].includes('(obsolete)');

/**
 * Set the display name of a skillnames.json entry, keeping aliases ([1..]) and never
 * overwriting an "(obsolete)" marker. Returns the previous name if it changed, else null.
 */
export function applyOfficialName(entry, name) {
	if (!Array.isArray(entry) || !entry.length || name == null) return null;
	if (isObsoleteName(entry)) return null;
	if (entry[0] === name) return null;
	const prev = entry[0];
	entry[0] = name;
	return prev;
}

/** Guard: a names file may gain entries but never lose any. */
export function assertNamesKept(before, after) {
	for (const k of Object.keys(before)) if (!(k in after)) throw new GuardError(`skillnames entry ${k} would be removed`);
}
