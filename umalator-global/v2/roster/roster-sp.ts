/**
 * Total SP spent by a roster uma.
 *
 * Reuses v2's existing SP primitives — `calculateSkillCost(id, new Map(), new Map())` is
 * equivalent to upstream's `costForId(id, new Map())` (hint 0 makes scaleBaseCost a
 * no-op), and our `skillGroups` sort matches upstream's. Only the aggregation below is
 * ported from kachi-dev's UmasTab.calcTotalSP.
 */
import { skillGroups, calculateSkillCost } from '../skill-chart-utils';
import skilldata from '../../skill_data.json';
import skillmeta from '../../../skill_meta.json';

const NO_HINTS = new Map<string, number>();
const NO_OWNED = new Map<string, string>();

/** Uniques (rarity 3-5) are awarded, not bought, so they don't count toward SP. */
function countsTowardSP(idStr: string): boolean {
	const rarity = (skilldata as any)[idStr]?.rarity ?? 1;
	return rarity < 3 || rarity > 5;
}

export function calcTotalSP(skills: Array<{ id: number; level: number }>): number {
	// Within a group you only ever pay the walk up to the highest tier you own.
	const highestIndexByGroup = new Map<string, number>();

	for (const s of skills) {
		const idStr = String(s.id);
		if (!countsTowardSP(idStr)) continue;
		const groupId = (skillmeta as any)[idStr]?.groupId;
		if (!groupId) continue;
		const group = skillGroups.get(groupId);
		const idx = group?.indexOf(idStr) ?? -1;
		if (idx < 0) continue;
		const best = highestIndexByGroup.get(groupId) ?? -1;
		if (idx > best) highestIndexByGroup.set(groupId, idx);
	}

	let total = 0;
	for (const [groupId, idx] of highestIndexByGroup) {
		const skillId = skillGroups.get(groupId)![idx];
		total += calculateSkillCost(skillId, NO_HINTS, NO_OWNED);
	}
	return total;
}
