/**
 * v2 Uma Panel Components
 * Compact horse configuration for the drawer
 */

import { h, Fragment } from 'preact';
import { useState, useMemo, useCallback, useRef, useEffect } from 'preact/hooks';

import { CustomSelect, IconSelect, Dropdown, Tooltip } from './components';
import { SkillsSection } from './skills';
import {
	getSavedSlotNames,
	saveHorseSlot,
	loadHorseSlot,
	deleteHorseSlot,
	downloadHorseJson,
	importHorseJson,
	copyHorseToClipboard,
	pasteHorseFromClipboard,
} from './storage';
import { ChevronRight, Save, Upload, Download, Copy, Clipboard, Trash2, RotateCcw, Camera } from 'lucide-react';
import { OCRModal } from './ocr-modal';

// Import data - use global versions for English names
import umas from '../umas.json';
import icons from '../../icons.json';
import skilldata from '../skill_data.json';

// ============================================
// UNIQUE SKILL CALCULATION
// ============================================

/**
 * Get the unique skill ID for an uma based on their outfit ID
 * Formula: 100000 + 10000 * (version - 1) + characterIndex * 10 + 1
 * e.g., outfit "102201" -> character 22, version 01 -> skill "100221"
 */
function uniqueSkillForUma(oid: string): string {
	const i = +oid.slice(1, -2);  // Character index (e.g., "22" from "102201")
	const v = +oid.slice(-2);      // Version number (e.g., "01" from "102201")
	const sid = (100000 + 10000 * (v - 1) + i * 10 + 1).toString();
	// Verify it's a valid skill
	if ((skilldata as Record<string, any>)[sid]) {
		return sid;
	}
	return '';
}

// Universally accessible pink skills (welfare + all '4' prefix skills)
const universallyAccessiblePinks = ['92111091'].concat(
	Object.keys(skilldata).filter(id => id[0] === '4')
);

/**
 * Check if a skill is a "general" skill that should be kept when switching umas
 * General skills: rarity < 3 (white/green/blue) OR universally accessible pinks
 */
function isGeneralSkill(id: string): boolean {
	const baseId = id.split('-')[0];
	const skill = (skilldata as Record<string, any>)[baseId];
	if (!skill) return false;
	return skill.rarity < 3 || universallyAccessiblePinks.includes(baseId);
}

// ============================================
// FIRST-TIME UMA SELECTION VIDEO
// ============================================

interface IntroVideoProps {
	onClose: () => void;
}

export function IntroVideo({ onClose }: IntroVideoProps) {
	const videoRef = useRef<HTMLVideoElement>(null);

	// Play video on mount
	useEffect(() => {
		if (videoRef.current) {
			videoRef.current.play().catch(() => {
				// Autoplay blocked, that's fine
			});
		}
	}, []);

	return (
		<div class="v2-intro-video-container">
			<video
				ref={videoRef}
				class="v2-intro-video"
				src="/uma-tools/videos/golshi_kick.webm"
				onEnded={onClose}
				muted
				playsInline
			/>
		</div>
	);
}

// Types
type Aptitude = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
type Strategy = 'Nige' | 'Senkou' | 'Sasi' | 'Oikomi' | 'Oonige';
type Mood = -2 | -1 | 0 | 1 | 2;

export interface UmaState {
	outfitId: string;
	speed: number;
	stamina: number;
	power: number;
	guts: number;
	wisdom: number;
	strategy: Strategy;
	distanceAptitude: Aptitude;
	surfaceAptitude: Aptitude;
	strategyAptitude: Aptitude;
	mood: Mood;
	skills: string[];
	forcedSkillPositions: Record<string, string>;
}

// Default state
export const defaultUmaState: UmaState = {
	outfitId: '',
	speed: 1200,
	stamina: 1200,
	power: 800,
	guts: 400,
	wisdom: 400,
	strategy: 'Senkou',
	distanceAptitude: 'S',
	surfaceAptitude: 'A',
	strategyAptitude: 'A',
	mood: 2,
	skills: [],
	forcedSkillPositions: {},
};

// ============================================
// STAT RANK CALCULATION
// ============================================

function rankForStat(x: number): number {
	if (x > 1200) {
		return Math.min(18 + Math.floor((x - 1200) / 100) * 10 + Math.floor(x / 10) % 10, 97);
	} else if (x >= 1150) {
		return 17; // SS+
	} else if (x >= 1100) {
		return 16; // SS
	} else if (x >= 400) {
		return 8 + Math.floor((x - 400) / 100);
	} else {
		return Math.floor(x / 50);
	}
}

// ============================================
// UMA PORTRAIT / SELECTOR
// ============================================

interface UmaPortraitProps {
	outfitId: string;
	onSelect: (outfitId: string) => void;
}

// Build search index
const umaAltIds = Object.keys(umas).flatMap(id => Object.keys((umas as any)[id].outfits));
const umaNamesForSearch: Record<string, string> = {};
umaAltIds.forEach(id => {
	const u = (umas as any)[id.slice(0, 4)];
	umaNamesForSearch[id] = (u.outfits[id] + ' ' + u.name[1]).toUpperCase().replace(/\./g, '');
});

function searchNames(query: string): string[] {
	const q = query.toUpperCase().replace(/\./g, '');
	return umaAltIds.filter(oid => umaNamesForSearch[oid].indexOf(q) > -1);
}

export function UmaPortrait({ outfitId, onSelect }: UmaPortraitProps) {
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [activeIdx, setActiveIdx] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	const uma = outfitId ? (umas as any)[outfitId.slice(0, 4)] : null;
	const suggestions = useMemo(() => searchNames(searchQuery), [searchQuery]);

	// Random mob portrait for empty state
	const randomMob = useMemo(() =>
		`/uma-tools/icons/mob/trained_mob_chr_icon_${8000 + Math.floor(Math.random() * 624)}_000001_01.png`,
	[]);

	const handleSelect = useCallback((oid: string) => {
		onSelect(oid);
		setIsSearchOpen(false);
		setSearchQuery('');
		setActiveIdx(-1);
	}, [onSelect]);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		const len = suggestions.length;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActiveIdx(i => (i + 1) % len);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActiveIdx(i => (i - 1 + len) % len);
		} else if (e.key === 'Enter' && activeIdx >= 0) {
			e.preventDefault();
			handleSelect(suggestions[activeIdx]);
		} else if (e.key === 'Escape') {
			setIsSearchOpen(false);
		}
	}, [suggestions, activeIdx, handleSelect]);

	// Scroll active item into view
	useEffect(() => {
		if (activeIdx >= 0 && listRef.current) {
			const item = listRef.current.children[activeIdx] as HTMLElement;
			item?.scrollIntoView({ block: 'nearest' });
		}
	}, [activeIdx]);

	return (
		<div class="v2-uma-portrait">
			<div class="v2-uma-portrait-image" onClick={() => {
				setIsSearchOpen(true);
				setTimeout(() => inputRef.current?.focus(), 0);
			}}>
				<img
					src={outfitId ? (icons as any)[outfitId] : randomMob}
					alt={uma?.name[1] || 'Select character'}
				/>
				<div class="v2-uma-portrait-badge">
					<img src="/uma-tools/icons/utx_ico_umamusume_00.png" alt="" />
				</div>
			</div>

			<div class="v2-uma-info">
				{uma ? (
					<>
						<span class="v2-uma-epithet">{uma.outfits[outfitId]}</span>
						<span class="v2-uma-name">{uma.name[1]}</span>
					</>
				) : (
					<span class="v2-uma-placeholder">Click portrait to select</span>
				)}
			</div>

			{isSearchOpen && (
				<div class="v2-uma-search-overlay" onClick={() => setIsSearchOpen(false)}>
					<div class="v2-uma-search-modal" onClick={e => e.stopPropagation()}>
						<input
							ref={inputRef}
							type="text"
							class="v2-uma-search-input"
							placeholder="Search character..."
							value={searchQuery}
							onInput={e => {
								setSearchQuery((e.target as HTMLInputElement).value);
								setActiveIdx(-1);
							}}
							onKeyDown={handleKeyDown}
						/>
						<ul ref={listRef} class="v2-uma-search-results">
							{suggestions.slice(0, 50).map((oid, i) => {
								const uid = oid.slice(0, 4);
								const u = (umas as any)[uid];
								return (
									<li
										key={oid}
										class={`v2-uma-search-item ${i === activeIdx ? 'active' : ''}`}
										onClick={() => handleSelect(oid)}
									>
										<img src={(icons as any)[oid]} alt="" loading="lazy" />
										<span class="v2-uma-search-epithet">{u.outfits[oid]}</span>
										<span class="v2-uma-search-name">{u.name[1]}</span>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}

// ============================================
// STAT INPUT WITH RANK ICON
// ============================================

interface StatInputProps {
	label: string;
	icon: string;
	value: number;
	onChange: (value: number) => void;
}

export function StatInput({ label, icon, value, onChange }: StatInputProps) {
	const rank = rankForStat(value);
	const rankIcon = `/uma-tools/icons/statusrank/ui_statusrank_${(100 + rank).toString().slice(1)}.png`;

	return (
		<div class="v2-stat-input">
			<div class="v2-stat-header">
				<img src={icon} alt={label} class="v2-stat-type-icon" />
				<span class="v2-stat-label">{label}</span>
			</div>
			<div class="v2-stat-value">
				<img src={rankIcon} alt="" class="v2-stat-rank-icon" />
				<input
					type="number"
					min="1"
					max="2000"
					value={value}
					onInput={e => onChange(parseInt((e.target as HTMLInputElement).value) || 1)}
				/>
			</div>
		</div>
	);
}

// ============================================
// STATS GRID
// ============================================

interface StatsGridProps {
	state: UmaState;
	onChange: (updates: Partial<UmaState>) => void;
}

export function StatsGrid({ state, onChange }: StatsGridProps) {
	const stats = [
		{ key: 'speed', label: 'Spd', icon: '/uma-tools/icons/status_00.png' },
		{ key: 'stamina', label: 'Sta', icon: '/uma-tools/icons/status_01.png' },
		{ key: 'power', label: 'Pow', icon: '/uma-tools/icons/status_02.png' },
		{ key: 'guts', label: 'Gut', icon: '/uma-tools/icons/status_03.png' },
		{ key: 'wisdom', label: 'Wit', icon: '/uma-tools/icons/status_04.png' },
	] as const;

	return (
		<div class="v2-stats-grid">
			{stats.map(s => (
				<StatInput
					key={s.key}
					label={s.label}
					icon={s.icon}
					value={state[s.key]}
					onChange={val => onChange({ [s.key]: val })}
				/>
			))}
		</div>
	);
}

// ============================================
// APTITUDE SELECT
// ============================================

const APTITUDES: Aptitude[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

// Build aptitude icon options
const APTITUDE_OPTIONS = APTITUDES.map(a => {
	const idx = 7 - APTITUDES.indexOf(a);
	return {
		value: a,
		iconSrc: `/uma-tools/icons/utx_ico_statusrank_${(100 + idx).toString().slice(1)}.png`,
		label: `Rank ${a}`
	};
});

interface AptitudeSelectProps {
	value: Aptitude;
	onChange: (value: Aptitude) => void;
	label: string;
}

export function AptitudeSelect({ value, onChange, label }: AptitudeSelectProps) {
	return (
		<div class="v2-aptitude-row">
			<span class="v2-aptitude-label">{label}</span>
			<IconSelect
				value={value}
				onChange={v => onChange(v as Aptitude)}
				options={APTITUDE_OPTIONS}
				iconSize={22}
				horizontal={true}
			/>
		</div>
	);
}

// ============================================
// MOOD SELECT
// ============================================

const MOOD_OPTIONS = [
	{ value: 2, iconSrc: '/uma-tools/icons/global/utx_ico_motivation_m_04.png', label: 'Great' },
	{ value: 1, iconSrc: '/uma-tools/icons/global/utx_ico_motivation_m_03.png', label: 'Good' },
	{ value: 0, iconSrc: '/uma-tools/icons/global/utx_ico_motivation_m_02.png', label: 'Normal' },
	{ value: -1, iconSrc: '/uma-tools/icons/global/utx_ico_motivation_m_01.png', label: 'Bad' },
	{ value: -2, iconSrc: '/uma-tools/icons/global/utx_ico_motivation_m_00.png', label: 'Awful' },
];

interface MoodSelectProps {
	value: Mood;
	onChange: (value: Mood) => void;
}

export function MoodSelect({ value, onChange }: MoodSelectProps) {
	return (
		<div class="v2-aptitude-row">
			<span class="v2-aptitude-label">Mood</span>
			<IconSelect
				value={value}
				onChange={v => onChange(v as Mood)}
				options={MOOD_OPTIONS}
				iconSize={20}
				horizontal={true}
				autoWidth={true}
			/>
		</div>
	);
}

// ============================================
// STRATEGY SELECT
// ============================================

const STRATEGIES: { value: Strategy; label: string }[] = [
	{ value: 'Oonige', label: 'Runaway' },
	{ value: 'Nige', label: 'Front Runner' },
	{ value: 'Senkou', label: 'Pace Chaser' },
	{ value: 'Sasi', label: 'Late Surger' },
	{ value: 'Oikomi', label: 'End Closer' },
];

interface StrategySelectProps {
	value: Strategy;
	onChange: (value: Strategy) => void;
}

export function StrategySelect({ value, onChange }: StrategySelectProps) {
	const options = STRATEGIES.map(s => ({ value: s.value, label: s.label }));

	return (
		<div class="v2-strategy-row">
			<span class="v2-strategy-label">Style</span>
			<CustomSelect
				value={value}
				onChange={v => onChange(v as Strategy)}
				options={options}
				className="v2-strategy-select"
			/>
		</div>
	);
}

// ============================================
// APTITUDES SECTION
// ============================================

interface AptitudesSectionProps {
	state: UmaState;
	onChange: (updates: Partial<UmaState>) => void;
}

export function AptitudesSection({ state, onChange }: AptitudesSectionProps) {
	return (
		<div class="v2-aptitudes-section">
			<div class="v2-aptitudes-grid">
				<AptitudeSelect
					label="Surface"
					value={state.surfaceAptitude}
					onChange={v => onChange({ surfaceAptitude: v })}
				/>
				<AptitudeSelect
					label="Distance"
					value={state.distanceAptitude}
					onChange={v => onChange({ distanceAptitude: v })}
				/>
				<AptitudeSelect
					label="Style"
					value={state.strategyAptitude}
					onChange={v => onChange({ strategyAptitude: v })}
				/>
				<MoodSelect
					value={state.mood}
					onChange={v => onChange({ mood: v })}
				/>
			</div>
			<StrategySelect
				value={state.strategy}
				onChange={v => onChange({ strategy: v })}
			/>
		</div>
	);
}

// ============================================
// COLLAPSIBLE SECTION
// ============================================

interface CollapsibleSectionProps {
	title: string;
	defaultOpen?: boolean;
	children: preact.ComponentChildren;
	badge?: string | number;
}

export function CollapsibleSection({ title, defaultOpen = false, children, badge }: CollapsibleSectionProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<div class={`v2-collapsible-section ${isOpen ? 'open' : ''}`}>
			<button class="v2-collapsible-header" onClick={() => setIsOpen(!isOpen)}>
				<ChevronRight size={16} class={`v2-collapsible-icon ${isOpen ? 'open' : ''}`} />
				<span class="v2-collapsible-title">{title}</span>
				{badge !== undefined && <span class="v2-collapsible-badge">{badge}</span>}
			</button>
			{isOpen && <div class="v2-collapsible-body">{children}</div>}
		</div>
	);
}

// ============================================
// FULL UMA PANEL
// ============================================

interface V2UmaPanelProps {
	state: UmaState;
	onChange: (updates: Partial<UmaState>) => void;
	onLoad?: (state: UmaState) => void;
	onReset?: () => void;
	onResetAll?: () => void;
	title?: string;
	courseDistance?: number;
}

export function V2UmaPanel({ state, onChange, onLoad, onReset, onResetAll, title = 'Umamusume', courseDistance }: V2UmaPanelProps) {
	const [savedSlots, setSavedSlots] = useState<string[]>([]);
	const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);

	// Refresh saved slots list
	const refreshSlots = useCallback(() => {
		setSavedSlots(getSavedSlotNames());
	}, []);

	// Load slots on mount
	useEffect(() => {
		refreshSlots();
	}, [refreshSlots]);

	const handleOutfitSelect = useCallback((outfitId: string) => {
		// When switching umas, keep only general skills (rarity < 3 or universally accessible)
		// This removes character-specific skills (uniques, golds, pinks) that don't transfer
		let newSkills = state.skills.filter(isGeneralSkill);

		// Also clean up forced positions for removed skills
		const removedSkillIds = new Set(state.skills.filter(id => !isGeneralSkill(id)));
		const newForcedPositions = { ...state.forcedSkillPositions };
		removedSkillIds.forEach(id => {
			delete newForcedPositions[id];
		});

		// Add the NEW uma's unique skill
		if (outfitId) {
			const newUniqueSkill = uniqueSkillForUma(outfitId);
			if (newUniqueSkill) {
				newSkills.unshift(newUniqueSkill);
			}
		}

		onChange({ outfitId, skills: newSkills, forcedSkillPositions: newForcedPositions });
	}, [onChange, state.skills, state.forcedSkillPositions]);

	// Save handlers
	const handleSaveNew = useCallback(() => {
		const uma = state.outfitId ? (umas as any)[state.outfitId.slice(0, 4)] : null;
		const defaultName = uma?.name?.[1] || 'Horse';
		const name = prompt('Enter a name for this build:', defaultName);
		if (name && name.trim()) {
			if (saveHorseSlot(name.trim(), state)) {
				refreshSlots();
			}
		}
	}, [state, refreshSlots]);

	const handleSaveOverwrite = useCallback((slotName: string) => {
		if (saveHorseSlot(slotName, state)) {
			refreshSlots();
		}
	}, [state, refreshSlots]);

	const handleDeleteSlot = useCallback((slotName: string) => {
		if (confirm(`Delete "${slotName}"?`)) {
			if (deleteHorseSlot(slotName)) {
				refreshSlots();
			}
		}
	}, [refreshSlots]);

	const handleDownloadJson = useCallback(() => {
		downloadHorseJson(state);
	}, [state]);

	const handleCopyToClipboard = useCallback(async () => {
		const success = await copyHorseToClipboard(state);
		if (success) {
			// Brief visual feedback could be added
		}
	}, [state]);

	// Load handlers
	const handleLoadSlot = useCallback((slotName: string) => {
		const loaded = loadHorseSlot(slotName);
		if (loaded && onLoad) {
			onLoad(loaded);
		}
	}, [onLoad]);

	const handleImportJson = useCallback(async () => {
		const imported = await importHorseJson();
		if (imported && onLoad) {
			onLoad(imported);
		}
	}, [onLoad]);

	const handlePasteFromClipboard = useCallback(async () => {
		const pasted = await pasteHorseFromClipboard();
		if (pasted && onLoad) {
			onLoad(pasted);
		}
	}, [onLoad]);

	const handleOCRConfirm = useCallback((umaState: UmaState) => {
		if (onLoad) {
			onLoad(umaState);
		}
	}, [onLoad]);

	// Build save menu items
	const saveMenuItems = useMemo(() => {
		const items: any[] = [
			{
				id: 'save-new',
				label: 'Save as new...',
				icon: <Save size={14} />,
				onClick: handleSaveNew,
			},
			{
				id: 'download',
				label: 'Download JSON',
				icon: <Download size={14} />,
				onClick: handleDownloadJson,
			},
			{
				id: 'copy',
				label: 'Copy to clipboard',
				icon: <Copy size={14} />,
				onClick: handleCopyToClipboard,
			},
		];

		if (savedSlots.length > 0) {
			items.push({ id: 'divider-1', label: '', divider: true });
			items.push({
				id: 'overwrite-header',
				label: 'Overwrite existing:',
				disabled: true,
			});
			savedSlots.slice(0, 5).forEach(name => {
				items.push({
					id: `save-${name}`,
					label: name,
					onClick: () => handleSaveOverwrite(name),
				});
			});
		}

		return items;
	}, [savedSlots, handleSaveNew, handleDownloadJson, handleCopyToClipboard, handleSaveOverwrite]);

	// Build load menu items
	const loadMenuItems = useMemo(() => {
		const items: any[] = [
			{
				id: 'import',
				label: 'Import JSON file...',
				icon: <Upload size={14} />,
				onClick: handleImportJson,
			},
			{
				id: 'paste',
				label: 'Paste from clipboard',
				icon: <Clipboard size={14} />,
				onClick: handlePasteFromClipboard,
			},
			{
				id: 'ocr',
				label: 'Import from screenshot (OCR)',
				icon: <Camera size={14} />,
				onClick: () => setIsOCRModalOpen(true),
			},
		];

		if (savedSlots.length > 0) {
			items.push({ id: 'divider-1', label: '', divider: true });
			items.push({
				id: 'load-header',
				label: 'Saved builds:',
				disabled: true,
			});
			savedSlots.forEach(name => {
				items.push({
					id: `load-${name}`,
					label: name,
					onClick: () => handleLoadSlot(name),
					suffix: (
						<Tooltip content="Delete" position="left">
							<button
								class="v2-load-menu-delete"
								onClick={(e) => {
									e.stopPropagation();
									handleDeleteSlot(name);
								}}
							>
								<Trash2 size={12} />
							</button>
						</Tooltip>
					),
				});
			});
		}

		return items;
	}, [savedSlots, handleImportJson, handlePasteFromClipboard, handleLoadSlot, handleDeleteSlot]);

	return (
		<div class="v2-uma-panel">
			{/* Header with actions */}
			<div class="v2-uma-panel-header">
				<h3>{title}</h3>
				<div class="v2-uma-panel-actions">
					<Tooltip content="Save" position="bottom">
						<Dropdown
							trigger={
								<button class="v2-uma-action-btn">
									<Save size={14} />
								</button>
							}
							items={saveMenuItems}
							align="right"
						/>
					</Tooltip>
					<Tooltip content="Load" position="bottom">
						<Dropdown
							trigger={
								<button class="v2-uma-action-btn">
									<Upload size={14} />
								</button>
							}
							items={loadMenuItems}
							align="right"
						/>
					</Tooltip>
					{onReset && (
						<Tooltip content="Reset" position="bottom">
							<button class="v2-uma-action-btn" onClick={onReset}>
								<RotateCcw size={14} />
							</button>
						</Tooltip>
					)}
					{onResetAll && (
						<Tooltip content="Reset All" position="bottom">
							<button class="v2-uma-action-btn" onClick={onResetAll}>
								<Trash2 size={14} />
							</button>
						</Tooltip>
					)}
				</div>
			</div>

			{/* Character portrait and selector */}
			<UmaPortrait outfitId={state.outfitId} onSelect={handleOutfitSelect} />

			{/* Stats */}
			<CollapsibleSection title="Stats" defaultOpen={true}>
				<StatsGrid state={state} onChange={onChange} />
			</CollapsibleSection>

			{/* Aptitudes */}
			<CollapsibleSection title="Aptitudes" defaultOpen={true}>
				<AptitudesSection state={state} onChange={onChange} />
			</CollapsibleSection>

			{/* Skills */}
			<CollapsibleSection title="Skills" badge={state.skills.length} defaultOpen={true}>
				<SkillsSection
					skills={state.skills}
					onChange={skills => onChange({ skills })}
					courseDistance={courseDistance}
					forcedSkillPositions={state.forcedSkillPositions}
					onForcedPositionChange={(skillId, position) => {
						const newPositions = { ...state.forcedSkillPositions };
						if (position.trim()) {
							newPositions[skillId] = position;
						} else {
							delete newPositions[skillId];
						}
						onChange({ forcedSkillPositions: newPositions });
					}}
				/>
			</CollapsibleSection>

			{/* OCR Modal */}
			<OCRModal
				isOpen={isOCRModalOpen}
				onClose={() => setIsOCRModalOpen(false)}
				onConfirm={handleOCRConfirm}
			/>
		</div>
	);
}
