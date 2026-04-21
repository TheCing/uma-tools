/**
 * Release Timeline
 *
 * Browse Uma Musume JP release history — scenarios + every support card,
 * grouped chronologically. Cards are attributed to the scenario that was
 * active at their release date. Uses the v2 component library.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/theCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render, Fragment } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { Search, Calendar, ListFilter } from 'lucide-react';

import {
	Input,
	SegmentedControl,
	CustomSelect,
	Badge,
	Switch,
	Tabs,
	type SelectOption,
	type TabItem,
} from '../umalator-global/v2/components';

import scenariosData from '../docs/jp-scenarios.json';
import cardsData from '../docs/jp-support-card-releases.json';

import '../umalator-global/v2/v2.css';
import './release-timeline.css';

// --- Types -----------------------------------------------------------------

interface Scenario {
	number: number;
	jpName: string;
	enName: string;
	startDate: string;
	endDate: string | null;
	lifespanDays: number;
	isCurrent: boolean;
}

type CardType = 'speed' | 'power' | 'guts' | 'stamina' | 'wit' | 'friend' | 'group';

interface Card {
	id: number;
	charaId: number;
	rarity: number;
	rarityLabel: 'R' | 'SR' | 'SSR';
	type: CardType;
	typeLabel: string;
	nameJp: string;
	nameEn: string | null;
	charaNameEn: string | null;
	startDateUnix: number;
	startDateJst: string;
	startDate: string;
	scenario: string;
}

type RarityFilter = 'all' | 'R' | 'SR' | 'SSR';
type TypeFilter = 'all' | CardType;
type ViewMode = 'scenario' | 'chronological';

const TYPE_ORDER: CardType[] = ['speed', 'stamina', 'power', 'guts', 'wit', 'friend', 'group'];
const TYPE_LABELS: Record<CardType, string> = {
	speed: 'Speed', stamina: 'Stamina', power: 'Power',
	guts: 'Guts', wit: 'Wit', friend: 'Friend', group: 'Group',
};

// --- Data ------------------------------------------------------------------

const scenarios = (scenariosData as any).scenarios as Scenario[];
const allCards = (cardsData as any).cards as Card[];

const SCENARIO_PALETTE = [
	'#6ca9e0', '#7fbf7e', '#f0a55a', '#e07373', '#b08ad4',
	'#d4b36a', '#6ac7d4', '#d46aa1', '#8a6a4a', '#e8d26a',
	'#74c69d', '#ef476f', '#f8a4c0',
];

const scenarioColorMap = new Map<string, string>();
scenarios.forEach((s, i) => scenarioColorMap.set(s.enName, SCENARIO_PALETTE[i % SCENARIO_PALETTE.length]));
scenarioColorMap.set('Pre-URA (JP launch period)', '#555');

const scenarioByName = new Map(scenarios.map(s => [s.enName, s]));

function displayName(c: Card): string {
	if (c.nameEn) return c.nameEn;
	// Hybrid fallback: keep JP epithet bracket, substitute English chara
	const bracketMatch = c.nameJp.match(/^\[([^\]]+)\]/);
	if (bracketMatch && c.charaNameEn) return `[${bracketMatch[1]}] ${c.charaNameEn}`;
	return c.nameJp;
}

/** Split "[Epithet] Character Name" into { epithet, chara }. Handles names without brackets too. */
function splitName(full: string): { epithet: string | null; chara: string } {
	const m = full.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
	if (m) return { epithet: m[1].trim(), chara: m[2].trim() };
	return { epithet: null, chara: full };
}

// --- Main App --------------------------------------------------------------

function App() {
	const [search, setSearch] = useState('');
	const [rarity, setRarity] = useState<RarityFilter>('all');
	const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
	const [scenarioFilter, setScenarioFilter] = useState<string>('all');
	const [showUnlocalized, setShowUnlocalized] = useState(true);
	const [view, setView] = useState<ViewMode>('scenario');

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return allCards.filter(c => {
			if (rarity !== 'all' && c.rarityLabel !== rarity) return false;
			if (typeFilter !== 'all' && c.type !== typeFilter) return false;
			if (scenarioFilter !== 'all' && c.scenario !== scenarioFilter) return false;
			if (!showUnlocalized && !c.nameEn) return false;
			if (q) {
				const hay = [c.nameJp, c.nameEn || '', c.charaNameEn || ''].join(' ').toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	}, [search, rarity, typeFilter, scenarioFilter, showUnlocalized]);

	const grouped = useMemo(() => {
		const groups = new Map<string, Card[]>();
		for (const c of filtered) {
			const k = c.scenario;
			if (!groups.has(k)) groups.set(k, []);
			groups.get(k)!.push(c);
		}
		return groups;
	}, [filtered]);

	const scenarioOptions: SelectOption[] = useMemo(() => [
		{ value: 'all', label: 'All scenarios' },
		...scenarios.map(s => ({
			value: s.enName,
			label: `${s.number}. ${s.enName}${s.isCurrent ? ' (current)' : ''}`,
		})),
	], []);

	const viewTabs: TabItem[] = [
		{ id: 'scenario', label: 'By Scenario', icon: <ListFilter size={14} /> },
		{ id: 'chronological', label: 'Chronological', icon: <Calendar size={14} /> },
	];

	return (
		<div class="rt-app">
			<header class="rt-header">
				<div class="rt-header-main">
					<h1 class="rt-title">Uma Musume Release Timeline</h1>
					<div class="rt-header-stats">
						<span><strong>{filtered.length}</strong> cards</span>
						<span class="rt-sep">•</span>
						<span><strong>{scenarios.length}</strong> scenarios</span>
						<span class="rt-sep">•</span>
						<span>JP server</span>
					</div>
				</div>
			</header>

			<section class="rt-scenario-strip" aria-label="Scenario timeline">
				{scenarios.map(s => {
					const color = scenarioColorMap.get(s.enName) || '#888';
					const isActive = scenarioFilter === s.enName;
					const isCurrent = s.isCurrent;
					return (
						<button
							key={s.enName}
							type="button"
							class={`rt-scenario-chip ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
							style={{ '--rt-accent': color } as any}
							onClick={() => setScenarioFilter(isActive ? 'all' : s.enName)}
							title={`${s.startDate} → ${s.endDate || 'current'} (${s.lifespanDays} days)`}
						>
							<span class="rt-scenario-num">#{s.number}</span>
							<span class="rt-scenario-name">{s.enName}</span>
							<span class="rt-scenario-dates">{s.startDate}</span>
						</button>
					);
				})}
			</section>

			<section class="rt-filters">
				<div class="rt-filters-row">
					<div class="rt-filter-grow">
						<Input
							value={search}
							onInput={setSearch}
							placeholder="Search by name (JP or EN) or character…"
							iconLeft={<Search size={14} />}
						/>
					</div>
					<SegmentedControl<RarityFilter>
						value={rarity}
						onChange={setRarity}
						size="sm"
						options={[
							{ value: 'all', label: 'All' },
							{ value: 'R', label: 'R' },
							{ value: 'SR', label: 'SR' },
							{ value: 'SSR', label: 'SSR' },
						]}
						ariaLabel="Filter by rarity"
					/>
					<div class="rt-filter-select">
						<CustomSelect
							value={scenarioFilter}
							onChange={(v) => setScenarioFilter(String(v))}
							options={scenarioOptions}
						/>
					</div>
				</div>
				<div class="rt-filters-row rt-filters-row-types">
					<span class="rt-filter-label">Type</span>
					<SegmentedControl<TypeFilter>
						value={typeFilter}
						onChange={setTypeFilter}
						size="sm"
						options={[
							{ value: 'all', label: 'All' },
							...TYPE_ORDER.map(t => ({
								value: t,
								label: TYPE_LABELS[t],
							})),
						]}
						ariaLabel="Filter by card type"
					/>
				</div>
				<div class="rt-filters-row rt-filters-row-2">
					<Switch
						checked={showUnlocalized}
						onChange={setShowUnlocalized}
						label="Show cards not yet on Global"
					/>
					<div class="rt-view-switch">
						<Tabs
							items={viewTabs}
							activeId={view}
							onChange={(id) => setView(id as ViewMode)}
							variant="segmented"
							size="sm"
						/>
					</div>
				</div>
			</section>

			<main class="rt-results">
				{filtered.length === 0 ? (
					<div class="rt-empty">No cards match those filters.</div>
				) : view === 'scenario' ? (
					scenarios
						.filter(s => grouped.has(s.enName))
						.map(s => (
							<ScenarioSection
								key={s.enName}
								scenario={s}
								cards={grouped.get(s.enName) || []}
								color={scenarioColorMap.get(s.enName) || '#888'}
							/>
						))
						.concat(
							grouped.has('Pre-URA (JP launch period)')
								? [<PreURASection cards={grouped.get('Pre-URA (JP launch period)')!} />]
								: []
						)
				) : (
					<ChronologicalList cards={filtered} />
				)}
			</main>

			<footer class="rt-footer">
				<span>Sources: JP master.mdb, Global master.mdb, GameTora public JSON</span>
			</footer>
		</div>
	);
}

// --- Scenario Section ------------------------------------------------------

function ScenarioSection({ scenario, cards, color }: { scenario: Scenario; cards: Card[]; color: string }) {
	const rarityCounts = {
		R: cards.filter(c => c.rarityLabel === 'R').length,
		SR: cards.filter(c => c.rarityLabel === 'SR').length,
		SSR: cards.filter(c => c.rarityLabel === 'SSR').length,
	};
	return (
		<section class="rt-section" style={{ '--rt-accent': color } as any}>
			<header class="rt-section-header">
				<div class="rt-section-title">
					<span class="rt-section-num">#{scenario.number}</span>
					<h2 class="rt-section-name">{scenario.enName}</h2>
					{scenario.isCurrent && <Badge variant="success" size="sm" outline>current</Badge>}
				</div>
				<div class="rt-section-meta">
					<span>{scenario.startDate}{scenario.endDate ? ` → ${scenario.endDate}` : ' → current'}</span>
					<span class="rt-sep">•</span>
					<span>{scenario.lifespanDays} days</span>
					<span class="rt-sep">•</span>
					<span>{cards.length} card{cards.length === 1 ? '' : 's'}</span>
					{rarityCounts.SSR > 0 && <span class="rt-rarity-count rt-rarity-ssr">{rarityCounts.SSR} SSR</span>}
					{rarityCounts.SR > 0 && <span class="rt-rarity-count rt-rarity-sr">{rarityCounts.SR} SR</span>}
					{rarityCounts.R > 0 && <span class="rt-rarity-count rt-rarity-r">{rarityCounts.R} R</span>}
				</div>
				<p class="rt-section-jp">{scenario.jpName}</p>
			</header>
			<ul class="rt-card-grid">
				{cards.map(c => <CardRow key={c.id} card={c} />)}
			</ul>
		</section>
	);
}

function PreURASection({ cards }: { cards: Card[] }) {
	return (
		<section class="rt-section rt-section-pre" style={{ '--rt-accent': '#555' } as any}>
			<header class="rt-section-header">
				<div class="rt-section-title">
					<h2 class="rt-section-name">Pre-URA (JP launch period)</h2>
				</div>
				<div class="rt-section-meta">
					<span>Before 2021-02-24</span>
					<span class="rt-sep">•</span>
					<span>{cards.length} card{cards.length === 1 ? '' : 's'}</span>
				</div>
			</header>
			<ul class="rt-card-grid">
				{cards.map(c => <CardRow key={c.id} card={c} />)}
			</ul>
		</section>
	);
}

// --- Chronological (flat) view ---------------------------------------------

function ChronologicalList({ cards }: { cards: Card[] }) {
	return (
		<ul class="rt-card-grid rt-card-grid-flat">
			{cards.map(c => <CardRow key={c.id} card={c} showScenario />)}
		</ul>
	);
}

// --- Card Row --------------------------------------------------------------

function CardRow({ card, showScenario = false }: { card: Card; showScenario?: boolean }) {
	const { epithet, chara } = splitName(displayName(card));
	const scenarioColor = scenarioColorMap.get(card.scenario) || '#888';
	return (
		<li class={`rt-card rt-rarity-${card.rarityLabel}`} style={{ '--rt-card-scenario': scenarioColor } as any}>
			<span class={`rt-card-rarity rt-rarity-${card.rarityLabel}`}>{card.rarityLabel}</span>
			<span class={`rt-card-type rt-type-${card.type}`} title={card.typeLabel}>{card.typeLabel}</span>
			<div class="rt-card-body">
				<div class="rt-card-name" title={card.nameJp}>
					{epithet && <span class="rt-card-epithet">{epithet}</span>}
					<span class="rt-card-chara">{chara}</span>
				</div>
				<div class="rt-card-meta">
					<span class="rt-card-date">{card.startDate}</span>
					{!card.nameEn && (
						<Badge variant="warning" size="sm" outline>JP only</Badge>
					)}
					{showScenario && (
						<span class="rt-card-scenario-tag" style={{ color: scenarioColor }}>
							{card.scenario}
						</span>
					)}
				</div>
			</div>
		</li>
	);
}

// --- Mount -----------------------------------------------------------------

const root = document.getElementById('app');
if (root) render(<App />, root);
