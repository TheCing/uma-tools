/**
 * Team Trials Planner
 *
 * 5 teams (Sprint / Mile / Medium / Long / Dirt), each a lineup of 3 runners.
 * 15 slots total. Each slot may override the uma's default running style.
 * Click empty slot → uma picker. Click filled slot → strategy + remove menu.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render, Fragment } from 'preact';
import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { Link, RotateCcw, Search, Check, Trash2 } from 'lucide-react';

import {
	Modal,
	Button,
	Input,
	SegmentedControl,
	Badge,
	Tooltip,
	Dropdown,
	type DropdownItem,
} from '../umalator-global/v2/components';

import umasData from '../umalator-global/umas.json';
import notInGameData from '../umalator-global/not-in-game.json';

import {
	TEAMS,
	TEAM_LABELS,
	SLOTS_PER_TEAM,
	SLOTS_TOTAL,
	emptyState,
	loadLocal,
	saveLocal,
	encodeHash,
	decodeHash,
	countFilled,
	countFilledAll,
	type Strategy,
	type TeamId,
	type TeamsState,
	type SlotValue,
} from './storage';

import '../umalator-global/v2/v2.css';
import './team-trials.css';

// --- Types -----------------------------------------------------------------

interface Outfit {
	aptitudes: number[];
	awakenings: string[];
	epithet: string;
	rarity: number;
	strategy: number;
}
interface UmaData {
	name: [string, string];
	outfits: Record<string, Outfit>;
}

interface UmaEntry {
	key: string;
	charaId: string;
	outfitId: string;
	name: string;
	epithet: string;
	defaultStrategy: Strategy;
	rarity: number;
	iconUrl: string;
	iconFallbackUrl: string;
	notInGame: boolean;
}

// --- Data ------------------------------------------------------------------

const umas = umasData as Record<string, UmaData>;
const notInGameOutfits = new Set((notInGameData as { outfits: string[] }).outfits || []);

const STRATEGY_ENUM_TO_KEY: Record<number, Strategy> = {
	1: 'front',
	2: 'pace',
	3: 'late',
	4: 'end',
};

const STRATEGY_LABELS: Record<Strategy, string> = {
	front: 'Front',
	pace: 'Pace',
	late: 'Late',
	end: 'End',
};

const STRATEGIES_ORDERED: Strategy[] = ['front', 'pace', 'late', 'end'];

function buildEntries(): UmaEntry[] {
	const entries: UmaEntry[] = [];
	for (const [charaId, data] of Object.entries(umas)) {
		const displayName = data.name[1] || data.name[0] || charaId;
		const baseOutfitId = `${charaId}01`;
		for (const [outfitId, outfit] of Object.entries(data.outfits)) {
			entries.push({
				key: `${charaId}_${outfitId}`,
				charaId,
				outfitId,
				name: displayName,
				epithet: outfit.epithet || '',
				defaultStrategy: STRATEGY_ENUM_TO_KEY[outfit.strategy] || 'front',
				rarity: outfit.rarity,
				iconUrl: `/uma-tools/icons/chara/trained_chr_icon_${charaId}_${outfitId}_02.png`,
				iconFallbackUrl: `/uma-tools/icons/chara/trained_chr_icon_${charaId}_${baseOutfitId}_02.png`,
				notInGame: notInGameOutfits.has(outfitId),
			});
		}
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name));
}

const ALL_ENTRIES = buildEntries();
const ENTRIES_BY_KEY = new Map(ALL_ENTRIES.map(e => [e.key, e]));

// --- Uma portrait with fallback --------------------------------------------

function UmaIcon({ entry, className = '' }: { entry: UmaEntry; className?: string }) {
	const handleError = (e: h.JSX.TargetedEvent<HTMLImageElement>) => {
		const img = e.currentTarget as HTMLImageElement;
		if (img.dataset.fallback === 'true') {
			img.dataset.failed = 'true';
			img.style.visibility = 'hidden';
			return;
		}
		img.dataset.fallback = 'true';
		img.src = entry.iconFallbackUrl;
	};

	return (
		<img
			src={entry.iconUrl}
			alt={entry.name}
			loading="lazy"
			onError={handleError}
			class={className}
		/>
	);
}

// --- Initial state ---------------------------------------------------------

function initialState(): TeamsState {
	if (typeof window !== 'undefined' && window.location.hash.length > 1) {
		const fromHash = decodeHash(window.location.hash.slice(1));
		if (fromHash) return fromHash;
	}
	return loadLocal() || emptyState();
}

// --- Main App --------------------------------------------------------------

function App() {
	const [state, setState] = useState<TeamsState>(() => initialState());
	const [picker, setPicker] = useState<{ team: TeamId; index: number } | null>(null);
	const [toast, setToast] = useState<string>('');
	const [confirmingReset, setConfirmingReset] = useState(false);

	useEffect(() => { saveLocal(state); }, [state]);

	useEffect(() => {
		function onHash() {
			if (window.location.hash.length > 1) {
				const decoded = decodeHash(window.location.hash.slice(1));
				if (decoded) setState(decoded);
			}
		}
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	}, []);

	const totalFilled = useMemo(() => countFilledAll(state), [state]);

	const setSlotValue = useCallback((team: TeamId, index: number, value: SlotValue) => {
		setState(prev => {
			const next = [...prev[team]];
			next[index] = value;
			return { ...prev, [team]: next };
		});
	}, []);

	const setSlotStrategy = useCallback((team: TeamId, index: number, strategy: Strategy | null) => {
		setState(prev => {
			const current = prev[team][index];
			if (!current) return prev;
			const next = [...prev[team]];
			next[index] = { ...current, strategy };
			return { ...prev, [team]: next };
		});
	}, []);

	const handleEmptySlotClick = (team: TeamId, index: number) => {
		setPicker({ team, index });
	};

	const handleRemoveSlot = (team: TeamId, index: number) => {
		setSlotValue(team, index, null);
	};

	const handlePick = (key: string) => {
		if (!picker) return;
		setSlotValue(picker.team, picker.index, { key, strategy: null });
		setPicker(null);
	};

	const handleReset = () => {
		if (totalFilled === 0) return;
		setConfirmingReset(true);
	};

	const confirmReset = () => {
		setState(emptyState());
		history.replaceState(null, '', window.location.pathname + window.location.search);
		setConfirmingReset(false);
		showToast('Cleared');
	};

	const handleCopyLink = async () => {
		const hash = encodeHash(state);
		const url = `${window.location.origin}${window.location.pathname}#${hash}`;
		try {
			await navigator.clipboard.writeText(url);
			history.replaceState(null, '', `#${hash}`);
			showToast('Link copied');
		} catch {
			prompt('Copy this link:', url);
		}
	};

	const showToast = (msg: string) => {
		setToast(msg);
		setTimeout(() => setToast(''), 1800);
	};

	const allUsedKeys = useMemo(() => {
		const set = new Set<string>();
		for (const t of TEAMS) for (const s of state[t]) if (s) set.add(s.key);
		return set;
	}, [state]);

	return (
		<div class="tt-app">
			<header class="tt-header">
				<div class="tt-header-main">
					<h1 class="tt-title">Team Trials Planner</h1>
					<div class="tt-count">
						<span class="tt-count-num">{totalFilled}</span>
						<span class="tt-count-label">/ {SLOTS_TOTAL} filled</span>
					</div>
				</div>
				<div class="tt-header-actions">
					<Button variant="ghost" icon={<RotateCcw size={14} />} onClick={handleReset}>Reset</Button>
					<Button variant="primary" icon={<Link size={14} />} onClick={handleCopyLink}>Copy Link</Button>
				</div>
			</header>

			<main class="tt-board">
				{TEAMS.map(teamId => (
					<TeamColumn
						key={teamId}
						teamId={teamId}
						slots={state[teamId]}
						onEmptyClick={(index) => handleEmptySlotClick(teamId, index)}
						onStrategyChange={(index, s) => setSlotStrategy(teamId, index, s)}
						onRemove={(index) => handleRemoveSlot(teamId, index)}
					/>
				))}
			</main>

			{picker && (
				<UmaPicker
					targetTeam={picker.team}
					usedKeys={allUsedKeys}
					onClose={() => setPicker(null)}
					onPick={handlePick}
				/>
			)}

			<Modal
				isOpen={confirmingReset}
				onClose={() => setConfirmingReset(false)}
				title="Clear all teams?"
				size="sm"
				footer={
					<Fragment>
						<Button variant="ghost" onClick={() => setConfirmingReset(false)}>Cancel</Button>
						<Button variant="danger" onClick={confirmReset}>Clear all</Button>
					</Fragment>
				}
			>
				<p class="tt-confirm-text">
					This will remove all {totalFilled} uma{totalFilled === 1 ? '' : 's'} from your {TEAMS.length} teams. This can't be undone.
				</p>
			</Modal>

			{toast && <div class="tt-toast">{toast}</div>}
		</div>
	);
}

// --- Team Column -----------------------------------------------------------

interface TeamColumnProps {
	teamId: TeamId;
	slots: SlotValue[];
	onEmptyClick: (index: number) => void;
	onStrategyChange: (index: number, strategy: Strategy | null) => void;
	onRemove: (index: number) => void;
}

function TeamColumn({ teamId, slots, onEmptyClick, onStrategyChange, onRemove }: TeamColumnProps) {
	const filled = countFilled(slots);
	return (
		<section class={`tt-team tt-team-${teamId}`} aria-label={TEAM_LABELS[teamId]}>
			<header class="tt-team-header">
				<h2 class="tt-team-label">{TEAM_LABELS[teamId]}</h2>
				<span class="tt-team-count">{filled}/{SLOTS_PER_TEAM}</span>
			</header>
			<div class="tt-slots">
				{slots.map((slot, i) => (
					<Slot
						key={i}
						slot={slot}
						onEmpty={() => onEmptyClick(i)}
						onStrategyChange={(s) => onStrategyChange(i, s)}
						onRemove={() => onRemove(i)}
					/>
				))}
			</div>
		</section>
	);
}

// --- Slot ------------------------------------------------------------------

interface SlotProps {
	slot: SlotValue;
	onEmpty: () => void;
	onStrategyChange: (strategy: Strategy | null) => void;
	onRemove: () => void;
}

function Slot({ slot, onEmpty, onStrategyChange, onRemove }: SlotProps) {
	if (!slot) {
		return (
			<button type="button" class="tt-slot tt-slot-empty" onClick={onEmpty} aria-label="Empty slot — click to add uma">
				<span class="tt-slot-plus" aria-hidden="true">+</span>
			</button>
		);
	}
	const entry = ENTRIES_BY_KEY.get(slot.key);
	if (!entry) {
		return (
			<button type="button" class="tt-slot tt-slot-unknown" onClick={onRemove} title="Unknown uma (data missing) — click to remove">
				<span>?</span>
			</button>
		);
	}

	const effectiveStrategy = slot.strategy ?? entry.defaultStrategy;
	const isOverridden = slot.strategy !== null;

	const menuItems: DropdownItem[] = [
		...STRATEGIES_ORDERED.map<DropdownItem>(s => {
			const isActive = s === effectiveStrategy;
			const isDefault = s === entry.defaultStrategy;
			return {
				id: `strat-${s}`,
				label: (
					<span class="tt-menu-strat-row">
						<span class={`tt-strat-dot tt-strategy-${s}`} aria-hidden="true" />
						<span>{STRATEGY_LABELS[s]}</span>
						{isDefault && <span class="tt-menu-default-tag">default</span>}
					</span>
				) as any,
				suffix: isActive ? <Check size={14} strokeWidth={3} class="tt-menu-check" /> : undefined,
				onClick: () => {
					// Picking the default clears the override; otherwise store the override
					onStrategyChange(isDefault ? null : s);
				},
			};
		}),
		{ id: 'divider', label: '', divider: true },
		{
			id: 'remove',
			label: 'Remove from slot',
			icon: <Trash2 size={14} />,
			danger: true,
			onClick: onRemove,
		},
	];

	const tooltipContent = `${entry.name} ${entry.epithet} — ${STRATEGY_LABELS[effectiveStrategy]}${isOverridden ? ' (override)' : ''}`;

	return (
		<Dropdown
			items={menuItems}
			align="left"
			portal
			className="tt-slot-dropdown"
			trigger={
				<Tooltip content={tooltipContent}>
					<div class={`tt-slot tt-slot-filled tt-strategy-${effectiveStrategy} ${isOverridden ? 'overridden' : ''}`}>
						<UmaIcon entry={entry} />
						{isOverridden && <span class="tt-slot-override-dot" aria-hidden="true" />}
					</div>
				</Tooltip>
			}
		/>
	);
}

// --- Uma Picker Modal ------------------------------------------------------

interface UmaPickerProps {
	targetTeam: TeamId;
	usedKeys: Set<string>;
	onClose: () => void;
	onPick: (key: string) => void;
}

type StrategyFilter = 'all' | Strategy;

function UmaPicker({ targetTeam, usedKeys, onClose, onPick }: UmaPickerProps) {
	const [search, setSearch] = useState('');
	const [filter, setFilter] = useState<StrategyFilter>('all');
	const [hideNotInGame, setHideNotInGame] = useState(true);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return ALL_ENTRIES.filter(e => {
			if (hideNotInGame && e.notInGame) return false;
			if (filter !== 'all' && e.defaultStrategy !== filter) return false;
			if (q && !(e.name.toLowerCase().includes(q) || e.epithet.toLowerCase().includes(q))) return false;
			return true;
		});
	}, [search, filter, hideNotInGame]);

	return (
		<Modal
			isOpen
			onClose={onClose}
			title={`Pick uma for ${TEAM_LABELS[targetTeam]}`}
			size="lg"
			className="tt-picker-modal"
		>
			<div class="tt-picker-controls">
				<Input
					value={search}
					onInput={setSearch}
					placeholder="Search by name or epithet…"
					iconLeft={<Search size={14} />}
				/>
				<SegmentedControl<StrategyFilter>
					value={filter}
					onChange={setFilter}
					size="sm"
					options={[
						{ value: 'all', label: 'All' },
						{ value: 'front', label: 'Front' },
						{ value: 'pace', label: 'Pace' },
						{ value: 'late', label: 'Late' },
						{ value: 'end', label: 'End' },
					]}
					ariaLabel="Filter by default strategy"
				/>
				<label class="tt-picker-toggle">
					<input type="checkbox" checked={hideNotInGame} onChange={(e) => setHideNotInGame((e.currentTarget as HTMLInputElement).checked)} />
					<span>Hide not-in-game</span>
				</label>
			</div>

			<div class="tt-picker-meta">
				<span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
			</div>

			<div class="tt-picker-grid">
				{filtered.map(entry => {
					const used = usedKeys.has(entry.key);
					return (
						<button
							key={entry.key}
							type="button"
							disabled={used}
							class={`tt-picker-card tt-strategy-${entry.defaultStrategy} ${used ? 'used' : ''}`}
							onClick={() => onPick(entry.key)}
							title={used ? `${entry.name} ${entry.epithet} — already in lineup` : `${entry.name} ${entry.epithet}`}
						>
							<UmaIcon entry={entry} />
							<div class="tt-picker-card-name">{entry.name}</div>
							<div class="tt-picker-card-epithet">{entry.epithet}</div>
							{entry.notInGame && (
								<span class="tt-picker-card-badge">
									<Badge variant="warning" size="sm" outline>Not in game</Badge>
								</span>
							)}
						</button>
					);
				})}
				{filtered.length === 0 && (
					<div class="tt-picker-empty">No umas match those filters.</div>
				)}
			</div>
		</Modal>
	);
}

// --- Mount -----------------------------------------------------------------

const root = document.getElementById('app');
if (root) render(<App />, root);
