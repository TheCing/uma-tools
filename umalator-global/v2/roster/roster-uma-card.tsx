import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { DecodedUma } from './roster-decoder';
import { getCharInfo, decodedUmaToUmaState, unknownSkillCount, aptToLetter, RosterCourse } from './roster-mapping';
import { calcTotalSP } from './roster-sp';
import { getSkillIcon } from '../skills';
import notInGameData from '../../not-in-game.json';
import skillnames from '../../skillnames.json';

// not-in-game.json is { outfits: string[], skills: string[] }
const NOT_IN_GAME_OUTFITS: Set<string> = new Set((notInGameData as any).outfits ?? []);
const NOT_IN_GAME_SKILLS: Set<string> = new Set((notInGameData as any).skills ?? []);

function skillName(id: number): string {
	return (skillnames as any)[String(id)]?.[0] ?? `Unknown (${id})`;
}

/** Upstream's in-game stat-rank curve (UmasTab.rankForStat). */
function rankForStat(x: number): number {
	if (x > 1200) return Math.min(18 + Math.floor((x - 1200) / 100) * 10 + Math.floor(x / 10) % 10, 97);
	if (x >= 1150) return 17;
	if (x >= 1100) return 16;
	if (x >= 400) return 8 + Math.floor((x - 400) / 100);
	return Math.floor(x / 50);
}

export function statRankStr(v: number): string {
	return String(100 + rankForStat(v)).slice(1);
}

const STATS: ReadonlyArray<{ label: string; key: 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom' }> = [
	{ label: 'SPD', key: 'speed' }, { label: 'STA', key: 'stamina' }, { label: 'POW', key: 'power' },
	{ label: 'GUT', key: 'guts' }, { label: 'WIT', key: 'wisdom' }
];

const APT_ROWS: ReadonlyArray<{ label: string; keys: ReadonlyArray<[string, keyof DecodedUma]> }> = [
	{ label: 'Surface', keys: [['Turf', 'apt_turf'], ['Dirt', 'apt_dirt']] },
	{ label: 'Distance', keys: [['Sprint', 'apt_short'], ['Mile', 'apt_mile'], ['Med', 'apt_middle'], ['Long', 'apt_long']] },
	{ label: 'Style', keys: [['Front', 'apt_nige'], ['Pace', 'apt_senko'], ['Late', 'apt_sashi'], ['End', 'apt_oikomi']] }
];

interface RosterUmaCardProps {
	uma: DecodedUma;
	course: RosterCourse;
	showUma2: boolean;
	onLoadUma1: (uma: DecodedUma) => void;
	onLoadUma2: (uma: DecodedUma) => void;
	onPromote: (uma: DecodedUma) => void;
}

export function RosterUmaCard({ uma, course, showUma2, onLoadUma1, onLoadUma2, onPromote }: RosterUmaCardProps) {
	const { charName, outfitName, iconSrc } = useMemo(() => getCharInfo(uma.card_id), [uma.card_id]);
	const sp = useMemo(() => calcTotalSP(uma.skills), [uma.skills]);
	const unknown = useMemo(() => unknownSkillCount(uma), [uma]);
	const mapped = useMemo(() => decodedUmaToUmaState(uma, course), [uma, course]);
	const outfitNotInGame = NOT_IN_GAME_OUTFITS.has(String(uma.card_id));

	return (
		<div class="rosterCard">
			<div class="rosterCardHeader">
				<img class="rosterCardIcon" src={iconSrc} alt="" loading="lazy" />
				<div class="rosterCardTitle">
					<div class="rosterCardName">{charName}</div>
					{outfitName && <div class="rosterCardOutfit">{outfitName}</div>}
				</div>
				{outfitNotInGame && <span class="rosterBadge rosterBadgeNotInGame">Not in game</span>}
			</div>

			<div class="rosterCardStats">
				{STATS.map(s => (
					<div class="rosterStat" key={s.key}>
						<span class="rosterStatLabel">{s.label}</span>
						<span class="rosterStatValue">{uma[s.key]}</span>
						<span class="rosterStatRank">{statRankStr(uma[s.key])}</span>
					</div>
				))}
			</div>

			<div class="rosterCardApts">
				{APT_ROWS.map(row => (
					<div class="rosterAptRow" key={row.label}>
						<span class="rosterAptRowLabel">{row.label}</span>
						{row.keys.map(([label, key]) => (
							<span class="rosterApt" key={key} title={label}>
								{label} <b>{aptToLetter(uma[key] as number)}</b>
							</span>
						))}
					</div>
				))}
			</div>

			<div class="rosterCardSkills">
				{uma.skills.map(s => {
					const idStr = String(s.id);
					return (
						<span
							class={`rosterSkill ${NOT_IN_GAME_SKILLS.has(idStr) ? 'rosterSkillNotInGame' : ''}`}
							key={idStr}
							title={NOT_IN_GAME_SKILLS.has(idStr) ? `${skillName(s.id)} (not in game)` : skillName(s.id)}
						>
							<img class="rosterSkillIcon" src={getSkillIcon(idStr)} alt="" loading="lazy" />
						</span>
					);
				})}
			</div>

			<div class="rosterCardMeta">
				<span title="Total SP spent (uniques excluded)">{sp} SP</span>
				<span>{uma.skills.length} skills</span>
				{uma.talent_level != null && <span>Talent {uma.talent_level}</span>}
				{uma.rank_score != null && <span>Rating {uma.rank_score}</span>}
				{unknown > 0 && (
					<span class="rosterCardWarn" title="Skills in this roster that Global doesn't have — excluded from SP and not loaded">
						{unknown} unrecognised
					</span>
				)}
			</div>

			<div class="rosterCardLoadInfo" title="Aptitudes are selected for the currently-selected course">
				Loads as {mapped.strategy} · {mapped.surfaceAptitude}/{mapped.distanceAptitude}/{mapped.strategyAptitude}
			</div>

			<div class="rosterCardActions">
				<button type="button" class="v2-trainee-load-btn uma1" onClick={() => onLoadUma1(uma)}>Load Uma 1</button>
				{showUma2 && <button type="button" class="v2-trainee-load-btn uma2" onClick={() => onLoadUma2(uma)}>Load Uma 2</button>}
				<button type="button" class="v2-trainee-load-btn v2-trainee-move-btn" onClick={() => onPromote(uma)} title="Copy into the Saved tab">Save</button>
			</div>
		</div>
	);
}
