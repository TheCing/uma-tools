import { h } from 'preact';
import { useState } from 'preact/hooks';
import { FilterState, AptKey, SortState, SortKey, SortDir, SORT_LABELS, activeFilterCount, EMPTY_FILTERS } from './roster-filter';
import { Button, CustomSelect, Input } from '../components';
import type { SelectOption } from '../components';

const APT_GRADES: ReadonlyArray<{ label: string; value: number }> = [
	{ label: '—', value: 0 }, { label: 'G', value: 1 }, { label: 'F', value: 2 }, { label: 'E', value: 3 },
	{ label: 'D', value: 4 }, { label: 'C', value: 5 }, { label: 'B', value: 6 }, { label: 'A', value: 7 },
	{ label: 'S', value: 8 }
];

const APT_FIELDS: ReadonlyArray<{ key: AptKey; label: string }> = [
	{ key: 'apt_turf', label: 'Turf' }, { key: 'apt_dirt', label: 'Dirt' },
	{ key: 'apt_short', label: 'Sprint' }, { key: 'apt_mile', label: 'Mile' },
	{ key: 'apt_middle', label: 'Medium' }, { key: 'apt_long', label: 'Long' },
	{ key: 'apt_nige', label: 'Front' }, { key: 'apt_senko', label: 'Pace' },
	{ key: 'apt_sashi', label: 'Late' }, { key: 'apt_oikomi', label: 'End' }
];

const APT_GRADE_OPTIONS: SelectOption[] = APT_GRADES.map(g => ({ value: g.value, label: g.label }));

const SORT_OPTIONS: SelectOption[] = (Object.keys(SORT_LABELS) as SortKey[])
	.map(k => ({ value: k, label: SORT_LABELS[k] }));

interface RosterFilterPanelProps {
	filters: FilterState;
	onChange: (f: FilterState) => void;
	sort: SortState;
	onSortChange: (s: SortState) => void;
	availableSkills: Array<{ id: number; name: string }>;
}

export function RosterFilterPanel({ filters, onChange, sort, onSortChange, availableSkills }: RosterFilterPanelProps) {
	const [skillQuery, setSkillQuery] = useState('');

	function setApt(key: AptKey, value: number) {
		const aptMin = { ...filters.aptMin };
		if (value === 0) delete aptMin[key]; else aptMin[key] = value;
		onChange({ ...filters, aptMin });
	}

	function toggleSkill(id: number) {
		const skills = filters.skills.includes(id)
			? filters.skills.filter(s => s !== id)
			: [...filters.skills, id];
		onChange({ ...filters, skills });
	}

	const MAX_SKILL_MATCHES = 30;
	const needle = skillQuery.trim().toLowerCase();
	const allMatches = needle
		? availableSkills.filter(s => s.name.toLowerCase().includes(needle))
		: [];
	const matches = allMatches.slice(0, MAX_SKILL_MATCHES);

	return (
		<div class="rosterFilters">
			<div
				class="rosterFilterRow"
				title="Your roster code has no timestamps, so 'Newest' uses the order uma.guide exports (training order, oldest to newest)."
			>
				<span class="rosterFilterLabel">Sort</span>
				<CustomSelect
					className="rosterSortSelect"
					value={sort.key}
					onChange={v => onSortChange({ ...sort, key: v as SortKey })}
					options={SORT_OPTIONS}
				/>
				<button
					type="button"
					class="rosterSortDir"
					title={sort.dir === 'desc' ? 'Descending' : 'Ascending'}
					onClick={() => onSortChange({ ...sort, dir: (sort.dir === 'desc' ? 'asc' : 'desc') as SortDir })}
				>
					{sort.dir === 'desc' ? '▼' : '▲'}
				</button>
			</div>

			<div class="rosterFilterSection">
				<div class="rosterFilterSectionTitle">Minimum aptitude</div>
				<div class="rosterAptGrid">
					{APT_FIELDS.map(f => (
						<label class="rosterAptFilter" key={f.key}>
							<span>{f.label}</span>
							<CustomSelect
								className="rosterAptSelect"
								value={filters.aptMin[f.key] ?? 0}
								onChange={v => setApt(f.key, Number(v))}
								options={APT_GRADE_OPTIONS}
							/>
						</label>
					))}
				</div>
			</div>

			<div class="rosterFilterSection">
				<div class="rosterFilterSectionTitle">Owns skills</div>
				<Input
					placeholder="Search skills to filter by…"
					value={skillQuery}
					onInput={setSkillQuery}
				/>
				{filters.skills.length > 0 && (
					<div class="rosterChips">
						{filters.skills.map(id => {
							const name = availableSkills.find(s => s.id === id)?.name ?? String(id);
							return (
								<button type="button" class="rosterChip" key={id} onClick={() => toggleSkill(id)} title="Remove">
									{name} ✕
								</button>
							);
						})}
					</div>
				)}
				{matches.length > 0 && (
					<div class="rosterSkillMatches">
						{matches.map(s => (
							<button
								type="button"
								class={`rosterSkillMatch ${filters.skills.includes(s.id) ? 'selected' : ''}`}
								key={s.id}
								onClick={() => toggleSkill(s.id)}
							>
								{s.name}
							</button>
						))}
					</div>
				)}
				{allMatches.length > MAX_SKILL_MATCHES && (
					<div class="rosterSkillMatchesMore">
						Showing {MAX_SKILL_MATCHES} of {allMatches.length} matches — refine your search.
					</div>
				)}
			</div>

			<div class="rosterFilterFooter">
				{/* activeFilterCount counts active CONSTRAINTS, not categories: each aptitude
				    threshold counts separately, so "filters active" (not "dimensions"). */}
				<span>{activeFilterCount(filters)} filters active</span>
				<Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
					Clear filters
				</Button>
			</div>
		</div>
	);
}
