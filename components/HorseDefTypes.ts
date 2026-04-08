import { Record, Map as ImmMap } from 'immutable';

import skills from '../uma-skill-tools/data/skill_data.json';
import skillmeta from '../skill_meta.json';

type Mood = -2 | -1 | 0 | 1 | 2;

export function isDebuffSkill(id: string) {
	// iconId 3xxxx is the debuff icons
	// i think this basically matches the intuitive behavior of being able to add multiple debuff skills and not other skills;
	// e.g. there are some skills with both a debuff component and a positive component and typically it doesnt make sense to
	// add multiple of those
	return skillmeta[id].iconId[0] == '3';
}

export function uniqueSkillForUma(oid: string, starCount: 1 | 2 | 3 | 4 | 5 = 3): string {
	if (oid.length == 0) return '';
	const i = +oid.slice(1, -2), v = +oid.slice(-2);
	const sid = (10000 * (1 + 9 * +(starCount > 2)) + 10000 * (v - 1) + i * 10 + 1).toString();
	if (!(skills as Record<string, any>)[sid]) return '';
	return sid;
}

export function SkillSet(ids): ImmMap<(typeof skill_meta)['groupId'], keyof typeof skills> {
	return ImmMap(ids.reduce((acc, id) => {
		const {entries, ndebuff} = acc;
		const groupId = skillmeta[id].groupId;
		if (isDebuffSkill(id)) {
			entries.push([groupId + '-' + ndebuff, id]);
			return {entries, ndebuff: ndebuff + 1};
		} else {
			entries.push([groupId, id]);
			return {entries, ndebuff};
		}
	}, {entries: [], ndebuff: 0}).entries);
}

export class HorseState extends Record({
	outfitId: '',
	starCount: 3 as 1 | 2 | 3 | 4 | 5,
	uniqueLv: 1,
	speed:   CC_GLOBAL ? 1200 : 1850,
	stamina: CC_GLOBAL ? 1200 : 1700,
	power:   CC_GLOBAL ? 800 : 1700,
	guts:    CC_GLOBAL ? 400 : 1200,
	wisdom:  CC_GLOBAL ? 400 : 1300,
	strategy: 'Senkou',
	distanceAptitude: 'S',
	surfaceAptitude: 'A',
	strategyAptitude: 'A',
	mood: 2 as Mood,
	skills: SkillSet([]),
	// Map of skillId -> forced position (in meters). If a skill is in this map, it will be forced to activate at that position.
	forcedSkillPositions: ImmMap()
}) {}
