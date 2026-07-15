import { h } from 'preact';
import { useState } from 'preact/hooks';
import { FilterState, AptKey, SortState, SortKey, SortDir, SORT_LABELS, activeFilterCount } from './roster-filter';

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

	const matches = skillQuery.trim()
		? availableSkills.filter(s => s.name.toLowerCase().includes(skillQuery.trim().toLowerCase())).slice(0, 30)
		: [];

	return (
		<div class="rosterFilters">
			<div class="rosterFilterRow">
				<label class="rosterFilterLabel" for="rosterSort">Sort</label>
				<select
					id="rosterSort"
					class="rosterSelect"
					value={sort.key}
					onChange={e => onSortChange({ ...sort, key: (e.currentTarget as HTMLSelectElement).value as SortKey })}
				>
					{(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
						<option value={k} key={k}>{SORT_LABELS[k]}</option>
					))}
				</select>
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
							<select
								class="rosterSelect"
								value={String(filters.aptMin[f.key] ?? 0)}
								onChange={e => setApt(f.key, Number((e.currentTarget as HTMLSelectElement).value))}
							>
								{APT_GRADES.map(g => <option value={String(g.value)} key={g.value}>{g.label}</option>)}
							</select>
						</label>
					))}
				</div>
			</div>

			<div class="rosterFilterSection">
				<div class="rosterFilterSectionTitle">Owns skills</div>
				<input
					type="text"
					class="rosterInput"
					placeholder="Search skills to filter by…"
					value={skillQuery}
					onInput={e => setSkillQuery((e.currentTarget as HTMLInputElement).value)}
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
			</div>

			<div class="rosterFilterFooter">
				{/* activeFilterCount counts active CONSTRAINTS, not categories: each aptitude
				    threshold counts separately, so "filters active" (not "dimensions"). */}
				<span>{activeFilterCount(filters)} filters active</span>
				<button
					type="button"
					class="rosterCardBtn rosterCardBtnGhost"
					onClick={() => onChange({ name: filters.name, aptMin: {}, skills: [] })}
				>
					Clear filters
				</button>
			</div>
		</div>
	);
}
