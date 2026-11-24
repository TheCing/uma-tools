/**
 * Extract umalator-global data structures from a Global master.mdb.
 *
 * The skill converter reproduces make_skill_data.pl's selection
 * (is_general_skill = 1 OR rarity >= 3) and the current skill_data.json schema,
 * including the fields that script never emitted: per-effect "scaling"
 * (ability_value_usage_*), "durationScaling" (ability_time_usage_*), "wisdomCheck"
 * (activate_lot) and "tags" (tag_id). Values are UNPATCHED; the x1.2 scenario patch is
 * handled by skill-data-rules.mjs.
 */

const ALT = [1, 2], EFF = [1, 2, 3];

export const REQUIRED_SCHEMA = {
	skill_data: ['id', 'rarity', 'group_id', 'icon_id', 'disp_order', 'activate_lot', 'tag_id', 'is_general_skill',
		...ALT.flatMap(n => ['precondition_' + n, 'condition_' + n, 'float_ability_time_' + n, 'ability_time_usage_' + n,
			...EFF.flatMap(m => ['ability_type_' + n + '_' + m, 'ability_value_usage_' + n + '_' + m,
				'float_ability_value_' + n + '_' + m, 'target_type_' + n + '_' + m])])],
	text_data: ['category', 'index', 'text'],
	card_data: ['id'],
	champions_schedule: ['id', 'start_date'],
	single_mode_skill_need_point: ['id', 'need_skill_point']
};

/** @returns {string[]} human-readable list of missing tables/columns (empty = ok) */
export function checkSchema(db) {
	const tables = new Set(db.tables());
	const missing = [];
	for (const [t, cols] of Object.entries(REQUIRED_SCHEMA)) {
		if (!tables.has(t)) { missing.push('table ' + t); continue; }
		const have = new Set(db.columns(t));
		for (const c of cols) if (!have.has(c)) missing.push(t + '.' + c);
	}
	return missing;
}

export function skillRowToDefinition(r) {
	const alternatives = [];
	for (const n of ALT) {
		const condition = r['condition_' + n];
		if (n > 1 && (condition == null || condition === '' || condition === '0')) continue;
		const effects = [];
		for (const m of EFF) {
			const type = r['ability_type_' + n + '_' + m];
			if (m > 1 && type === 0) continue;
			effects.push({
				modifier: r['float_ability_value_' + n + '_' + m],
				scaling: r['ability_value_usage_' + n + '_' + m],
				target: r['target_type_' + n + '_' + m],
				type
			});
		}
		alternatives.push({
			baseDuration: r['float_ability_time_' + n],
			condition,
			durationScaling: r['ability_time_usage_' + n],
			effects,
			precondition: r['precondition_' + n]
		});
	}
	return {
		alternatives,
		rarity: r.rarity,
		tags: String(r.tag_id ?? '').split('/').filter(Boolean).map(Number),
		wisdomCheck: r.activate_lot
	};
}

/** Same grouping as make_global_skill_meta.pl. */
export function skillMetaFromRow(r) {
	let g = r.group_id;
	if (g >= 1000 && g < 2000) g += 9000;              // 1/2-star uniques join their 3-star group
	else if (g >= 9000000) g = 90000 + g % 10000;      // evolved unique inherits join the unevolved group
	return {baseCost: r.need_skill_point ?? 0, groupId: String(g), iconId: String(r.icon_id), order: r.disp_order};
}

/** Everything the ingest needs from the Global DB, read once. */
export function readGlobalMaster(db) {
	const skillRows = db.query('SELECT * FROM skill_data ORDER BY id');
	const metaRows = db.query('SELECT s.id, s.group_id, s.icon_id, COALESCE(sp.need_skill_point, 0) AS need_skill_point, s.disp_order ' +
		'FROM skill_data s LEFT JOIN single_mode_skill_need_point sp ON s.id = sp.id ' +
		'WHERE s.is_general_skill = 1 OR s.rarity >= 3 ORDER BY s.id');
	const inSkillData = r => r.is_general_skill === 1 || r.rarity >= 3;

	const definitions = {}, meta = {};
	for (const r of skillRows) if (inSkillData(r)) definitions[String(r.id)] = skillRowToDefinition(r);
	for (const r of metaRows) meta[String(r.id)] = skillMetaFromRow(r);

	return {
		skillIds: skillRows.map(r => String(r.id)),
		definitions,
		meta,
		skillNames: db.text(47),
		epithets: db.text(5),
		charaNames: db.text(170),
		outfitIds: db.ids('card_data'),
		cmDates: readCmDates(db),
		tableCount: db.tables().length
	};
}

/** Global Champions Meeting start dates: {cmId: 'YYYY-MM-DD'} (UTC, as build.mjs always did). */
export function readCmDates(db) {
	const out = {};
	for (const r of db.query("SELECT id, strftime('%Y-%m-%d', start_date, 'unixepoch') AS date FROM champions_schedule ORDER BY id"))
		out[String(r.id)] = r.date;
	return out;
}
