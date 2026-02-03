/**
 * V2 Skills Components
 * SkillChip, SkillPickerModal, and SkillsSection
 */

import { h } from 'preact';
import { useState, useMemo, useCallback, useRef, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { X, Search, Plus, ArrowUpDown, ChevronDown } from 'lucide-react';
import { Dropdown } from './components';

// Import condition matching
import { getParser } from '../../uma-skill-tools/ConditionParser';
import * as Matcher from '../../uma-skill-tools/tools/ConditionMatcher';

// Import data - use Global versions
import skilldata from '../skill_data.json';
import skillmeta from '../skill_meta.json';
import skillnames from '../skillnames.json';

// ============================================
// CONDITION PARSING FOR FILTERS
// ============================================

const Parser = getParser(Matcher.mockConditions);

function C(s: string) {
	return Parser.parseAny(Parser.tokenize(s));
}

// Filter condition matchers (from v1)
const filterOps: Record<string, any[]> = {
	// Strategy
	'nige': [C('running_style==1')],
	'senkou': [C('running_style==2')],
	'sasi': [C('running_style==3')],
	'oikomi': [C('running_style==4')],
	// Distance
	'short': [C('distance_type==1')],
	'mile': [C('distance_type==2')],
	'medium': [C('distance_type==3')],
	'long': [C('distance_type==4')],
	// Surface
	'turf': [C('ground_type==1')],
	'dirt': [C('ground_type==2')],
	// Location/Phase
	'phase0': [C('phase==0'), C('phase_random==0'), C('phase_firsthalf_random==0'), C('phase_laterhalf_random==0')],
	'phase1': [C('phase==1'), C('phase>=1'), C('phase_random==1'), C('phase_firsthalf_random==1'), C('phase_laterhalf_random==1')],
	'phase2': [C('phase==2'), C('phase>=2'), C('phase_random==2'), C('phase_firsthalf_random==2'), C('phase_laterhalf_random==2'), C('phase_firstquarter_random==2'), C('is_lastspurt==1')],
	'phase3': [C('phase==3'), C('phase_random==3'), C('phase_firsthalf_random==3'), C('phase_laterhalf_random==3')],
	'finalcorner': [C('is_finalcorner==1'), C('is_finalcorner_laterhalf==1'), C('is_finalcorner_random==1')],
	'finalstraight': [C('is_last_straight==1'), C('is_last_straight_onetime==1')],
};

// Pre-parse all skill conditions for matching
const parsedConditions: Record<string, any[]> = {};
Object.keys(skilldata).forEach(id => {
	const skill = (skilldata as Record<string, any>)[id];
	if (skill?.alternatives) {
		parsedConditions[id] = skill.alternatives.map((ef: any) =>
			Parser.parse(Parser.tokenize(ef.condition))
		);
	}
});

// ============================================
// SKILL HELPERS
// ============================================

// Get skill name from skillnames.json
export function getSkillName(skillId: string): string {
	const names = (skillnames as Record<string, string[]>)[skillId];
	return names?.[0] || `Skill ${skillId}`;
}

// Get skill icon path from skillmeta
export function getSkillIcon(skillId: string): string {
	const meta = (skillmeta as Record<string, { iconId: string }>)[skillId];
	return meta ? `/uma-tools/icons/${meta.iconId}.png` : '/uma-tools/icons/10011.png';
}

// Get skill rarity class for styling
// SkillRarity: White = 1, Gold = 2, Unique = 3/4/5, Evolution/Pink = 6
export function getSkillRarityClass(skillId: string): string {
	const skill = (skilldata as Record<string, { rarity: number }>)[skillId];
	if (!skill) return 'skill-white';
	const r = skill.rarity;
	if (r === 1) return 'skill-white';
	if (r === 2) return 'skill-gold';
	if (r >= 3 && r <= 5) return 'skill-unique';
	if (r === 6) return 'skill-pink';
	return 'skill-white';
}

// Check if skill matches rarity filter
function matchRarity(id: string, testRarity: string): boolean {
	const skill = (skilldata as Record<string, { rarity: number }>)[id];
	if (!skill) return false;
	const r = skill.rarity;
	switch (testRarity) {
		case 'white':
			return r === 1 && id[0] !== '9';
		case 'gold':
			return r === 2;
		case 'pink':
			return r === 6;
		case 'unique':
			return r > 2 && r < 6;
		case 'inherit':
			return id[0] === '9';
		default:
			return true;
	}
}

// Check if skill matches a condition filter
function matchConditionFilter(id: string, filterKey: string): boolean {
	const ops = filterOps[filterKey];
	const conditions = parsedConditions[id];
	if (!ops || !conditions) return false;
	return ops.some(op => conditions.some(alt => Matcher.treeMatch(op, alt)));
}

// Build skill list (unsorted - sorting applied dynamically)
const allSkillIds = Object.keys(skilldata).filter(id => {
	const skill = (skilldata as Record<string, any>)[id];
	return skill && skill.rarity >= 1;
});

// ============================================
// SORT OPTIONS
// ============================================

type SortOption = 'rarity' | 'alpha' | 'game';

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
	{ id: 'rarity', label: 'Rarity' },
	{ id: 'alpha', label: 'A-Z' },
	{ id: 'game', label: 'Game Order' },
];

// Sort comparators
function sortByRarity(a: string, b: string): number {
	const skillA = (skilldata as Record<string, any>)[a];
	const skillB = (skilldata as Record<string, any>)[b];
	const rA = skillA.rarity;
	const rB = skillB.rarity;
	// Gold skills (2) first
	if (rA === 2 && rB !== 2) return -1;
	if (rB === 2 && rA !== 2) return 1;
	// Then white (1)
	if (rA === 1 && rB !== 1) return -1;
	if (rB === 1 && rA !== 1) return 1;
	// Then by rarity for uniques (3-5)
	if (rA !== rB) return rB - rA;
	// Then alphabetically by name
	const nameCompare = getSkillName(a).localeCompare(getSkillName(b));
	if (nameCompare !== 0) return nameCompare;
	// Finally by ID (ascending)
	return parseInt(a, 10) - parseInt(b, 10);
}

function sortByAlpha(a: string, b: string): number {
	const nameCompare = getSkillName(a).localeCompare(getSkillName(b));
	if (nameCompare !== 0) return nameCompare;
	// Tiebreaker: sort by ID ascending
	return parseInt(a, 10) - parseInt(b, 10);
}

function sortByGameOrder(a: string, b: string): number {
	const metaA = (skillmeta as Record<string, { order: number }>)[a];
	const metaB = (skillmeta as Record<string, { order: number }>)[b];
	const orderA = metaA?.order ?? 99999;
	const orderB = metaB?.order ?? 99999;
	if (orderA !== orderB) return orderA - orderB;
	// Then alphabetically
	const nameCompare = getSkillName(a).localeCompare(getSkillName(b));
	if (nameCompare !== 0) return nameCompare;
	// Finally by ID ascending
	return parseInt(a, 10) - parseInt(b, 10);
}

function getSortComparator(sortOption: SortOption): (a: string, b: string) => number {
	switch (sortOption) {
		case 'alpha': return sortByAlpha;
		case 'game': return sortByGameOrder;
		case 'rarity':
		default: return sortByRarity;
	}
}

// Pre-compute search index
const skillSearchIndex: Record<string, string> = {};
allSkillIds.forEach(id => {
	const name = getSkillName(id);
	skillSearchIndex[id] = name.toUpperCase();
});

// ============================================
// FILTER DEFINITIONS
// ============================================

const RARITY_FILTERS = [
	{ id: 'white', label: 'White' },
	{ id: 'gold', label: 'Gold' },
	{ id: 'unique', label: 'Unique' },
	{ id: 'inherit', label: 'Inherited' },
];

const STRATEGY_FILTERS = [
	{ id: 'nige', label: 'Front Runner' },
	{ id: 'senkou', label: 'Pace Chaser' },
	{ id: 'sasi', label: 'Late Surger' },
	{ id: 'oikomi', label: 'End Closer' },
];

const DISTANCE_FILTERS = [
	{ id: 'short', label: 'Sprint' },
	{ id: 'mile', label: 'Mile' },
	{ id: 'medium', label: 'Medium' },
	{ id: 'long', label: 'Long' },
];

const SURFACE_FILTERS = [
	{ id: 'turf', label: 'Turf' },
	{ id: 'dirt', label: 'Dirt' },
];

const LOCATION_FILTERS = [
	{ id: 'phase0', label: 'Opening' },
	{ id: 'phase1', label: 'Middle' },
	{ id: 'phase2', label: 'Final' },
	{ id: 'phase3', label: 'Spurt' },
	{ id: 'finalcorner', label: 'F. Corner' },
	{ id: 'finalstraight', label: 'F. Straight' },
];

// ============================================
// SKILL DETAILS HELPERS
// ============================================

// Effect type names (Global English)
const EFFECT_TYPE_NAMES: Record<number, string> = {
	1: 'Speed',
	2: 'Stamina',
	3: 'Power',
	4: 'Guts',
	5: 'Wit',
	9: 'Recovery',
	21: 'Current Speed',
	22: 'Current Speed (w/ decel)',
	27: 'Target Speed',
	28: 'Lane Speed',
	31: 'Acceleration',
	37: 'Random Gold Skill',
	42: 'Duration Increase',
};

// Format effect value based on type
function formatEffectValue(type: number, modifier: number): string {
	const value = modifier / 10000;
	switch (type) {
		case 9: // Recovery - percentage
			return `${(value * 100).toFixed(1)}%`;
		case 31: // Acceleration
			return `${value > 0 ? '+' : ''}${value}m/s²`;
		case 42: // Duration increase
			return `${value}×`;
		default: // Stats and speed - show with sign
			return value > 0 ? `+${value}` : `${value}`;
	}
}

// ============================================
// SKILL CHIP - Expandable skill display
// ============================================

interface SkillChipProps {
	skillId: string;
	onRemove?: () => void;
	courseDistance?: number;
	forcedPosition?: string;
	onPositionChange?: (value: string) => void;
}

export function SkillChip({ skillId, onRemove, courseDistance, forcedPosition, onPositionChange }: SkillChipProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const name = getSkillName(skillId);
	const icon = getSkillIcon(skillId);
	const rarityClass = getSkillRarityClass(skillId);
	const skill = (skilldata as Record<string, any>)[skillId];

	const handleClick = useCallback(() => {
		setIsExpanded(prev => !prev);
	}, []);

	return (
		<div
			class={`v2-skill-chip ${rarityClass} ${isExpanded ? 'expanded' : ''}`}
			onClick={handleClick}
		>
			<div class="v2-skill-chip-header">
				<img src={icon} alt="" class="v2-skill-chip-icon" />
				<span class="v2-skill-chip-name">{name}</span>
				{onRemove && (
					<button
						type="button"
						class="v2-skill-chip-remove"
						onClick={e => {
							e.stopPropagation();
							onRemove();
						}}
					>
						<X size={12} />
					</button>
				)}
			</div>
			{isExpanded && skill && (
				<div class="v2-skill-details" onClick={e => e.stopPropagation()}>
					<div class="v2-skill-detail-row">
						<span class="v2-skill-detail-label">ID:</span>
						<span class="v2-skill-detail-value">{skillId}</span>
					</div>
					{skill.alternatives?.map((alt: any, idx: number) => (
						<div key={idx} class="v2-skill-alternative">
							{alt.precondition && (
								<div class="v2-skill-detail-row">
									<span class="v2-skill-detail-label">Precondition:</span>
									<span class="v2-skill-detail-value v2-skill-condition">{alt.precondition}</span>
								</div>
							)}
							<div class="v2-skill-detail-row">
								<span class="v2-skill-detail-label">Condition:</span>
								<span class="v2-skill-detail-value v2-skill-condition">{alt.condition}</span>
							</div>
							<div class="v2-skill-detail-row">
								<span class="v2-skill-detail-label">Effects:</span>
								<div class="v2-skill-effects">
									{alt.effects?.map((ef: any, i: number) => (
										<span key={i} class="v2-skill-effect">
											<span class="v2-effect-type">{EFFECT_TYPE_NAMES[ef.type] || `Type ${ef.type}`}</span>
											<span class="v2-effect-value">{formatEffectValue(ef.type, ef.modifier)}</span>
										</span>
									))}
								</div>
							</div>
							{alt.baseDuration > 0 && (
								<div class="v2-skill-detail-row">
									<span class="v2-skill-detail-label">Duration:</span>
									<span class="v2-skill-detail-value">
										{(alt.baseDuration / 10000).toFixed(2)}s base
										{courseDistance && ` → ${((alt.baseDuration / 10000) * (courseDistance / 1000)).toFixed(2)}s @ ${courseDistance}m`}
									</span>
								</div>
							)}
						</div>
					))}
					{onPositionChange && (
						<div class="v2-skill-detail-row v2-skill-force-position">
							<label class="v2-skill-detail-label">Force @ position (m):</label>
							<input
								type="number"
								class="v2-force-position-input"
								placeholder="Optional"
								value={forcedPosition || ''}
								onInput={(e) => onPositionChange((e.target as HTMLInputElement).value)}
								onClick={(e) => e.stopPropagation()}
								min="0"
								step="10"
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ============================================
// SKILL PICKER MODAL
// ============================================

// Filter group types
type FilterGroup = 'rarity' | 'strategy' | 'distance' | 'surface' | 'location';

interface SkillPickerModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (skillId: string) => void;
	selectedSkills: string[];
}

export function SkillPickerModal({ isOpen, onClose, onSelect, selectedSkills }: SkillPickerModalProps) {
	const [searchQuery, setSearchQuery] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const [activeIdx, setActiveIdx] = useState(-1);

	// Sort state
	const [sortOption, setSortOption] = useState<SortOption>('rarity');

	// Filter state - tracks active filter for each group (null = all)
	const [activeFilters, setActiveFilters] = useState<Record<FilterGroup, string | null>>({
		rarity: null,
		strategy: null,
		distance: null,
		surface: null,
		location: null,
	});

	// Focus input when opened
	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isOpen]);

	// Toggle a filter (clicking same filter twice clears it)
	const toggleFilter = useCallback((group: FilterGroup, filterId: string) => {
		setActiveFilters(prev => ({
			...prev,
			[group]: prev[group] === filterId ? null : filterId,
		}));
	}, []);

	// Filter and sort skills
	const filteredSkills = useMemo(() => {
		const query = searchQuery.toUpperCase();
		const filtered = allSkillIds.filter(id => {
			// Check search query first (most selective usually)
			if (query && skillSearchIndex[id].indexOf(query) === -1) return false;

			// Check rarity filter
			if (activeFilters.rarity && !matchRarity(id, activeFilters.rarity)) return false;

			// Check condition-based filters
			if (activeFilters.strategy && !matchConditionFilter(id, activeFilters.strategy)) return false;
			if (activeFilters.distance && !matchConditionFilter(id, activeFilters.distance)) return false;
			if (activeFilters.surface && !matchConditionFilter(id, activeFilters.surface)) return false;
			if (activeFilters.location && !matchConditionFilter(id, activeFilters.location)) return false;

			return true;
		});
		// Apply sorting
		return filtered.sort(getSortComparator(sortOption));
	}, [searchQuery, activeFilters, sortOption]);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		const len = filteredSkills.length;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIdx(i => Math.min(i + 1, len - 1));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIdx(i => Math.max(i - 1, 0));
		} else if (e.key === 'Enter' && activeIdx >= 0 && activeIdx < len) {
			e.preventDefault();
			const skillId = filteredSkills[activeIdx];
			if (!selectedSkills.includes(skillId)) {
				onSelect(skillId);
			}
		} else if (e.key === 'Escape') {
			onClose();
		}
	}, [filteredSkills, activeIdx, selectedSkills, onSelect, onClose]);

	// Scroll active item into view
	useEffect(() => {
		if (activeIdx >= 0 && listRef.current) {
			const item = listRef.current.children[activeIdx] as HTMLElement;
			item?.scrollIntoView({ block: 'nearest' });
		}
	}, [activeIdx]);

	// Reset search, filters, and sort when closed
	useEffect(() => {
		if (!isOpen) {
			setSearchQuery('');
			setActiveIdx(-1);
			setSortOption('rarity');
			setActiveFilters({
				rarity: null,
				strategy: null,
				distance: null,
				surface: null,
				location: null,
			});
		}
	}, [isOpen]);

	if (!isOpen) return null;

	const modal = (
		<div class="v2-skill-picker-overlay" onClick={onClose}>
			<div class="v2-skill-picker-modal" onClick={e => e.stopPropagation()}>
				{/* Search header */}
				<div class="v2-skill-picker-header">
					<div class="v2-skill-picker-search">
						<Search size={16} class="v2-skill-picker-search-icon" />
						<input
							ref={inputRef}
							type="text"
							placeholder="Search skills..."
							value={searchQuery}
							onInput={e => {
								setSearchQuery((e.target as HTMLInputElement).value);
								setActiveIdx(-1);
							}}
							onKeyDown={handleKeyDown}
						/>
					</div>
					<Dropdown
						trigger={
							<button class="v2-skill-picker-sort" type="button">
								<ArrowUpDown size={14} />
								<span>{SORT_OPTIONS.find(o => o.id === sortOption)?.label}</span>
								<ChevronDown size={14} />
							</button>
						}
						items={SORT_OPTIONS.map(opt => ({
							id: opt.id,
							label: opt.label,
							onClick: () => setSortOption(opt.id),
						}))}
						align="right"
					/>
					<button class="v2-skill-picker-close" onClick={onClose}>
						<X size={18} />
					</button>
				</div>

				{/* Filter groups */}
				<div class="v2-skill-picker-filters">
					{/* Row 1: Rarity + Strategy */}
					<div class="v2-filter-row">
						<div class="v2-filter-group rarity">
							<span class="v2-filter-label">Rarity</span>
							<div class="v2-filter-chips">
								{RARITY_FILTERS.map(f => (
									<button
										key={f.id}
										type="button"
										class={`v2-skill-filter-btn ${f.id} ${activeFilters.rarity === f.id ? 'active' : ''}`}
										onClick={() => toggleFilter('rarity', f.id)}
									>
										{f.label}
									</button>
								))}
							</div>
						</div>
						<div class="v2-filter-divider" />
						<div class="v2-filter-group strategy">
							<span class="v2-filter-label">Strategy</span>
							<div class="v2-filter-chips">
								{STRATEGY_FILTERS.map(f => (
									<button
										key={f.id}
										type="button"
										class={`v2-skill-filter-btn strategy ${activeFilters.strategy === f.id ? 'active' : ''}`}
										onClick={() => toggleFilter('strategy', f.id)}
									>
										{f.label}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Row 2: Distance + Surface + Location */}
					<div class="v2-filter-row">
						<div class="v2-filter-group distance">
							<span class="v2-filter-label">Distance</span>
							<div class="v2-filter-chips">
								{DISTANCE_FILTERS.map(f => (
									<button
										key={f.id}
										type="button"
										class={`v2-skill-filter-btn distance ${activeFilters.distance === f.id ? 'active' : ''}`}
										onClick={() => toggleFilter('distance', f.id)}
									>
										{f.label}
									</button>
								))}
							</div>
						</div>
						<div class="v2-filter-divider" />
						<div class="v2-filter-group surface">
							<span class="v2-filter-label">Surface</span>
							<div class="v2-filter-chips">
								{SURFACE_FILTERS.map(f => (
									<button
										key={f.id}
										type="button"
										class={`v2-skill-filter-btn surface ${activeFilters.surface === f.id ? 'active' : ''}`}
										onClick={() => toggleFilter('surface', f.id)}
									>
										{f.label}
									</button>
								))}
							</div>
						</div>
						<div class="v2-filter-divider" />
						<div class="v2-filter-group location">
							<span class="v2-filter-label">Phase</span>
							<div class="v2-filter-chips">
								{LOCATION_FILTERS.map(f => (
									<button
										key={f.id}
										type="button"
										class={`v2-skill-filter-btn location ${activeFilters.location === f.id ? 'active' : ''}`}
										onClick={() => toggleFilter('location', f.id)}
									>
										{f.label}
									</button>
								))}
							</div>
						</div>
					</div>
				</div>

				{/* Skill list */}
				<div ref={listRef} class="v2-skill-picker-list">
					{filteredSkills.map((id, i) => {
						const isSelected = selectedSkills.includes(id);
						const name = getSkillName(id);
						const icon = getSkillIcon(id);
						const rarityClass = getSkillRarityClass(id);

						return (
							<button
								key={id}
								type="button"
								class={`v2-skill-picker-item ${rarityClass} ${isSelected ? 'selected' : ''} ${i === activeIdx ? 'active' : ''}`}
								onClick={() => {
									if (!isSelected) {
										onSelect(id);
									}
								}}
								disabled={isSelected}
							>
								<img src={icon} alt="" class="v2-skill-picker-item-icon" />
								<span class="v2-skill-picker-item-name">{name}</span>
								{isSelected && <span class="v2-skill-picker-item-check">✓</span>}
							</button>
						);
					})}
					{filteredSkills.length === 0 && (
						<div class="v2-skill-picker-empty">
							No skills found
						</div>
					)}
				</div>
			</div>
		</div>
	);

	return createPortal(modal, document.body);
}

// ============================================
// SKILLS SECTION
// ============================================

interface SkillsSectionProps {
	skills: string[];
	onChange: (skills: string[]) => void;
	courseDistance?: number;
	forcedSkillPositions?: Record<string, string>;
	onForcedPositionChange?: (skillId: string, position: string) => void;
}

// Sort skills like v1: by skillmeta order, then by ID
function skillOrder(a: string, b: string): number {
	const metaA = (skillmeta as Record<string, { order: number }>)[a];
	const metaB = (skillmeta as Record<string, { order: number }>)[b];
	const x = metaA?.order ?? 99999;
	const y = metaB?.order ?? 99999;
	// Primary: by order ascending
	if (x !== y) return x - y;
	// Fallback: by ID ascending (string comparison like v1)
	return a < b ? -1 : a > b ? 1 : 0;
}

export function SkillsSection({ skills, onChange, courseDistance, forcedSkillPositions, onForcedPositionChange }: SkillsSectionProps) {
	const [isPickerOpen, setIsPickerOpen] = useState(false);

	const handleAddSkill = useCallback((skillId: string) => {
		if (!skills.includes(skillId)) {
			onChange([...skills, skillId]);
		}
	}, [skills, onChange]);

	const handleRemoveSkill = useCallback((skillId: string) => {
		onChange(skills.filter(id => id !== skillId));
	}, [skills, onChange]);

	// Sort skills for display (like v1)
	const sortedSkills = useMemo(() => [...skills].sort(skillOrder), [skills]);

	return (
		<div class="v2-skills-section">
			{sortedSkills.length > 0 ? (
				<div class="v2-skills-list">
					{sortedSkills.map(id => (
						<SkillChip
							key={id}
							skillId={id}
							onRemove={() => handleRemoveSkill(id)}
							courseDistance={courseDistance}
							forcedPosition={forcedSkillPositions?.[id]}
							onPositionChange={onForcedPositionChange ? (pos) => onForcedPositionChange(id, pos) : undefined}
						/>
					))}
				</div>
			) : (
				<div class="v2-skills-empty">
					No skills added yet
				</div>
			)}

			<button
				type="button"
				class="v2-add-skill-btn"
				onClick={() => setIsPickerOpen(true)}
			>
				<Plus size={14} />
				Add Skill
			</button>

			<SkillPickerModal
				isOpen={isPickerOpen}
				onClose={() => setIsPickerOpen(false)}
				onSelect={handleAddSkill}
				selectedSkills={skills}
			/>
		</div>
	);
}
