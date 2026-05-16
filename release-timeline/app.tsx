/**
 * Release Timeline
 *
 * Browse Uma Musume JP release history — scenarios + every support card + every
 * uma outfit, grouped chronologically. Entries are attributed to the scenario
 * that was active at their release date. Uses the v2 component library.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render, Fragment } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { Search, Calendar, ListFilter, CreditCard, User } from 'lucide-react';

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
import anniversariesData from '../docs/jp-anniversaries.json';
import cmsData from '../docs/jp-champions-meetings.json';
import cardsData from '../docs/jp-support-card-releases.json';
import umasData from '../docs/jp-uma-releases.json';

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

interface Anniversary {
	ordinal: string;       // "0", "1", "1.5", "2", ...
	label: string;         // "1st Anniversary", "1.5 Anniversary", "JP Launch"
	longLabel: string;
	date: string;          // YYYY-MM-DD
	isHalf: boolean;
	isLaunch: boolean;
	isPast: boolean;
}

interface AnniversaryAttribution {
	anniversary: string | null;
	anniversaryLabel: string | null;
	relationToAnniversary: 'with' | 'after' | 'pre-launch';
	daysFromAnniversary: number | null;
	anniversaryTag: string;
	isAnniversaryLaunch: boolean;
}

interface CmAttribution {
	firstCmId: number | null;        // smallest CM whose start is at-or-after release date
	firstCmName: string | null;
	firstCmStartDate: string | null;
	daysToFirstCm: number | null;    // days between release and that CM's start
}

interface ChampionsMeeting {
	id: number;
	name: string;
	nameJp: string;
	isLoh: boolean;
	startDate: string;
	endDate: string;
	track: string;
	trackId: number;
	distance: number;
	ground: string;
	condition: string;
	weather: string;
	season: string;
}

type CardType = 'speed' | 'power' | 'guts' | 'stamina' | 'wit' | 'friend' | 'group';

interface Card extends AnniversaryAttribution, CmAttribution {
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

interface Uma extends AnniversaryAttribution, CmAttribution {
	cardId: number;
	charaId: number;
	rarity: number;
	rarityLabel: string;
	obtained: string;
	nameJp: string;
	nameEn: string;
	titleJp: string | null;
	titleEn: string | null;
	urlName: string;
	startDate: string;
	releaseEn: string | null;
	scenario: string;
}

type Mode = 'cards' | 'umas';
type RarityFilter = 'all' | 'R' | 'SR' | 'SSR';
type TypeFilter = 'all' | CardType;
type UmaRarityFilter = 'all' | '1' | '2' | '3';
type ViewMode = 'scenario' | 'chronological';

const TYPE_ORDER: CardType[] = ['speed', 'stamina', 'power', 'guts', 'wit', 'friend', 'group'];
const TYPE_LABELS: Record<CardType, string> = {
	speed: 'Speed', stamina: 'Stamina', power: 'Power',
	guts: 'Guts', wit: 'Wit', friend: 'Friend', group: 'Group',
};

// --- Data ------------------------------------------------------------------

const scenarios = (scenariosData as any).scenarios as Scenario[];
const anniversaries = (anniversariesData as any).anniversaries as Anniversary[];
const championsMeetings = (cmsData as any).champions_meetings as ChampionsMeeting[];
const cmsById = new Map(championsMeetings.map(c => [c.id, c]));
const allCards = (cardsData as any).cards as Card[];
const allUmas = (umasData as any).umas as Uma[];

const SCENARIO_PALETTE = [
	'#6ca9e0', '#7fbf7e', '#f0a55a', '#e07373', '#b08ad4',
	'#d4b36a', '#6ac7d4', '#d46aa1', '#8a6a4a', '#e8d26a',
	'#74c69d', '#ef476f', '#f8a4c0',
];

const scenarioColorMap = new Map<string, string>();
scenarios.forEach((s, i) => scenarioColorMap.set(s.enName, SCENARIO_PALETTE[i % SCENARIO_PALETTE.length]));
scenarioColorMap.set('Pre-URA (JP launch period)', '#555');

function displayCardName(c: Card): string {
	if (c.nameEn) return c.nameEn;
	const bracketMatch = c.nameJp.match(/^\[([^\]]+)\]/);
	if (bracketMatch && c.charaNameEn) return `[${bracketMatch[1]}] ${c.charaNameEn}`;
	return c.nameJp;
}

function splitName(full: string): { epithet: string | null; chara: string } {
	const m = full.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
	if (m) return { epithet: m[1].trim(), chara: m[2].trim() };
	return { epithet: null, chara: full };
}

function umaDisplayEpithet(u: Uma): string | null {
	// Prefer official Global translation; else fall back to JP (readers can recognize epithets)
	return u.titleEn || u.titleJp || null;
}

function umaIconUrl(u: Uma): string {
	return `/uma-tools/icons/chara/trained_chr_icon_${u.charaId}_${u.cardId}_02.png`;
}
function umaIconFallback(u: Uma): string {
	const base = `${u.charaId}01`;
	return `/uma-tools/icons/chara/trained_chr_icon_${u.charaId}_${base}_02.png`;
}

// --- Main App --------------------------------------------------------------

function App() {
	const [mode, setMode] = useState<Mode>('cards');
	const [search, setSearch] = useState('');
	const [rarity, setRarity] = useState<RarityFilter>('all');
	const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
	const [umaRarity, setUmaRarity] = useState<UmaRarityFilter>('all');
	const [scenarioFilter, setScenarioFilter] = useState<string>('all');
	const [anniversaryFilter, setAnniversaryFilter] = useState<string>('all');  // ordinal or 'all' or 'any-launch'
	const [cmFilter, setCmFilter] = useState<string>('all');  // 'all' or numeric CM id (entries available in time for that CM)
	const [showUnlocalized, setShowUnlocalized] = useState(true);
	const [view, setView] = useState<ViewMode>('scenario');

	// --- filter Support Cards ---
	const filteredCards = useMemo(() => {
		const q = search.trim().toLowerCase();
		return allCards.filter(c => {
			if (rarity !== 'all' && c.rarityLabel !== rarity) return false;
			if (typeFilter !== 'all' && c.type !== typeFilter) return false;
			if (scenarioFilter !== 'all' && c.scenario !== scenarioFilter) return false;
			if (anniversaryFilter === 'any-launch' && !c.isAnniversaryLaunch) return false;
			else if (anniversaryFilter !== 'all' && anniversaryFilter !== 'any-launch' && c.anniversary !== anniversaryFilter) return false;
			if (cmFilter !== 'all') {
				const targetCm = cmsById.get(parseInt(cmFilter, 10));
				if (!targetCm || c.startDate > targetCm.startDate) return false;
			}
			if (!showUnlocalized && !c.nameEn) return false;
			if (q) {
				const hay = [c.nameJp, c.nameEn || '', c.charaNameEn || ''].join(' ').toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	}, [search, rarity, typeFilter, scenarioFilter, anniversaryFilter, cmFilter, showUnlocalized]);

	// --- filter Umas ---
	const filteredUmas = useMemo(() => {
		const q = search.trim().toLowerCase();
		return allUmas.filter(u => {
			if (umaRarity !== 'all' && String(u.rarity) !== umaRarity) return false;
			if (scenarioFilter !== 'all' && u.scenario !== scenarioFilter) return false;
			if (anniversaryFilter === 'any-launch' && !u.isAnniversaryLaunch) return false;
			else if (anniversaryFilter !== 'all' && anniversaryFilter !== 'any-launch' && u.anniversary !== anniversaryFilter) return false;
			if (cmFilter !== 'all') {
				const targetCm = cmsById.get(parseInt(cmFilter, 10));
				if (!targetCm || u.startDate > targetCm.startDate) return false;
			}
			if (!showUnlocalized && !u.titleEn) return false;
			if (q) {
				const hay = [u.nameJp, u.nameEn, u.titleJp || '', u.titleEn || ''].join(' ').toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		});
	}, [search, umaRarity, scenarioFilter, anniversaryFilter, cmFilter, showUnlocalized]);

	const groupedCards = useMemo(() => {
		const g = new Map<string, Card[]>();
		for (const c of filteredCards) {
			if (!g.has(c.scenario)) g.set(c.scenario, []);
			g.get(c.scenario)!.push(c);
		}
		return g;
	}, [filteredCards]);

	const groupedUmas = useMemo(() => {
		const g = new Map<string, Uma[]>();
		for (const u of filteredUmas) {
			if (!g.has(u.scenario)) g.set(u.scenario, []);
			g.get(u.scenario)!.push(u);
		}
		return g;
	}, [filteredUmas]);

	const scenarioOptions: SelectOption[] = useMemo(() => [
		{ value: 'all', label: 'All scenarios' },
		...scenarios.map(s => ({
			value: s.enName,
			label: `${s.number}. ${s.enName}${s.isCurrent ? ' (current)' : ''}`,
		})),
	], []);

	const anniversaryOptions: SelectOption[] = useMemo(() => [
		{ value: 'all', label: 'Any anniversary' },
		{ value: 'any-launch', label: '★ Anniversary launches only (±3 days)' },
		...anniversaries
			.filter(a => a.isPast)
			.map(a => ({
				value: a.ordinal,
				label: `${a.label} (${a.date})`,
			})),
	], []);

	// CM dropdown: select a CM to see only entries available in time for it
	const cmOptions: SelectOption[] = useMemo(() => [
		{ value: 'all', label: 'Any CM (no filter)' },
		// Newest first
		...[...championsMeetings].reverse().map(c => ({
			value: String(c.id),
			label: `Built for #${c.id} ${c.name} — ${c.startDate} (${c.track} ${c.distance}m ${c.ground})`,
		})),
	], []);

	const viewTabs: TabItem[] = [
		{ id: 'scenario', label: 'By Scenario', icon: <ListFilter size={14} /> },
		{ id: 'chronological', label: 'Chronological', icon: <Calendar size={14} /> },
	];

	const modeTabs: TabItem[] = [
		{ id: 'cards', label: `Support Cards (${allCards.length})`, icon: <CreditCard size={14} /> },
		{ id: 'umas', label: `Umas (${allUmas.length})`, icon: <User size={14} /> },
	];

	return (
		<div class="rt-app">
			<header class="rt-header">
				<div class="rt-header-main">
					<h1 class="rt-title">Uma Musume Release Timeline</h1>
				</div>
				<div class="rt-mode-tabs">
					<Tabs
						items={modeTabs}
						activeId={mode}
						onChange={(id) => setMode(id as Mode)}
						variant="line"
						size="md"
					/>
				</div>
			</header>

			<section class="rt-anniv-strip" aria-label="Anniversary milestones">
				{anniversaries.map(a => {
					const isActive = anniversaryFilter === a.ordinal;
					return (
						<button
							key={a.ordinal}
							type="button"
							disabled={!a.isPast}
							class={`rt-anniv-chip ${isActive ? 'active' : ''} ${a.isLaunch ? 'launch' : a.isHalf ? 'half' : 'full'} ${!a.isPast ? 'upcoming' : ''}`}
							onClick={() => setAnniversaryFilter(isActive ? 'all' : a.ordinal)}
							title={`${a.label} — ${a.date}${a.isPast ? '' : ' (upcoming)'}`}
						>
							<span class="rt-anniv-mark" aria-hidden="true">{a.isLaunch ? '★' : a.isHalf ? '·' : '●'}</span>
							<span class="rt-anniv-label">{a.isLaunch ? 'Launch' : a.label.replace(' Anniversary', '')}</span>
							<span class="rt-anniv-date">{a.date}</span>
						</button>
					);
				})}
			</section>

			<section class="rt-scenario-strip" aria-label="Scenario timeline">
				{scenarios.map(s => {
					const color = scenarioColorMap.get(s.enName) || '#888';
					const isActive = scenarioFilter === s.enName;
					return (
						<button
							key={s.enName}
							type="button"
							class={`rt-scenario-chip ${isActive ? 'active' : ''} ${s.isCurrent ? 'current' : ''}`}
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
							placeholder={`Search ${mode === 'cards' ? 'cards' : 'umas'} by name or epithet…`}
							iconLeft={<Search size={14} />}
						/>
					</div>
					{mode === 'cards' ? (
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
					) : (
						<SegmentedControl<UmaRarityFilter>
							value={umaRarity}
							onChange={setUmaRarity}
							size="sm"
							options={[
								{ value: 'all', label: 'All' },
								{ value: '1', label: '1★' },
								{ value: '2', label: '2★' },
								{ value: '3', label: '3★' },
							]}
							ariaLabel="Filter by rarity"
						/>
					)}
					<div class="rt-filter-select">
						<CustomSelect
							value={scenarioFilter}
							onChange={(v) => setScenarioFilter(String(v))}
							options={scenarioOptions}
						/>
					</div>
					<div class="rt-filter-select">
						<CustomSelect
							value={anniversaryFilter}
							onChange={(v) => setAnniversaryFilter(String(v))}
							options={anniversaryOptions}
						/>
					</div>
					<div class="rt-filter-select rt-filter-select-cm">
						<CustomSelect
							value={cmFilter}
							onChange={(v) => setCmFilter(String(v))}
							options={cmOptions}
						/>
					</div>
				</div>

				{mode === 'cards' && (
					<div class="rt-filters-row rt-filters-row-types">
						<span class="rt-filter-label">Type</span>
						<SegmentedControl<TypeFilter>
							value={typeFilter}
							onChange={setTypeFilter}
							size="sm"
							options={[
								{ value: 'all', label: 'All' },
								...TYPE_ORDER.map(t => ({ value: t, label: TYPE_LABELS[t] })),
							]}
							ariaLabel="Filter by card type"
						/>
					</div>
				)}

				<div class="rt-filters-row rt-filters-row-2">
					<Switch
						checked={showUnlocalized}
						onChange={setShowUnlocalized}
						label="Show entries not yet on Global"
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
				{mode === 'cards'
					? <CardResults filtered={filteredCards} grouped={groupedCards} view={view} />
					: <UmaResults filtered={filteredUmas} grouped={groupedUmas} view={view} />}
			</main>

			<footer class="rt-footer">
				<span>Sources: JP master.mdb, Global master.mdb, GameTora public JSON</span>
			</footer>
		</div>
	);
}

// --- Results wrappers ------------------------------------------------------

function CardResults({ filtered, grouped, view }: { filtered: Card[]; grouped: Map<string, Card[]>; view: ViewMode }) {
	if (filtered.length === 0) return <div class="rt-empty">No cards match those filters.</div>;
	if (view === 'chronological') {
		return (
			<ul class="rt-card-grid rt-card-grid-flat">
				{filtered.map(c => <CardRow key={c.id} card={c} showScenario />)}
			</ul>
		);
	}
	const sections = scenarios
		.filter(s => grouped.has(s.enName))
		.map(s => (
			<ScenarioSection<Card>
				key={s.enName}
				scenario={s}
				items={grouped.get(s.enName) || []}
				color={scenarioColorMap.get(s.enName) || '#888'}
				renderItem={c => <CardRow key={c.id} card={c} />}
				summary={items => cardSummary(items)}
			/>
		));
	if (grouped.has('Pre-URA (JP launch period)')) {
		sections.push(
			<PreURASection<Card>
				key="pre"
				items={grouped.get('Pre-URA (JP launch period)')!}
				renderItem={c => <CardRow key={c.id} card={c} />}
			/>
		);
	}
	return <Fragment>{sections}</Fragment>;
}

function UmaResults({ filtered, grouped, view }: { filtered: Uma[]; grouped: Map<string, Uma[]>; view: ViewMode }) {
	if (filtered.length === 0) return <div class="rt-empty">No umas match those filters.</div>;
	if (view === 'chronological') {
		return (
			<ul class="rt-card-grid rt-card-grid-flat">
				{filtered.map(u => <UmaCard key={u.cardId} uma={u} showScenario />)}
			</ul>
		);
	}
	const sections = scenarios
		.filter(s => grouped.has(s.enName))
		.map(s => (
			<ScenarioSection<Uma>
				key={s.enName}
				scenario={s}
				items={grouped.get(s.enName) || []}
				color={scenarioColorMap.get(s.enName) || '#888'}
				renderItem={u => <UmaCard key={u.cardId} uma={u} />}
				summary={items => umaSummary(items)}
			/>
		));
	return <Fragment>{sections}</Fragment>;
}

// --- Summary renderers -----------------------------------------------------

function cardSummary(cards: Card[]) {
	const r = cards.filter(c => c.rarityLabel === 'R').length;
	const sr = cards.filter(c => c.rarityLabel === 'SR').length;
	const ssr = cards.filter(c => c.rarityLabel === 'SSR').length;
	return (
		<Fragment>
			<span>{cards.length} card{cards.length === 1 ? '' : 's'}</span>
			{ssr > 0 && <span class="rt-rarity-count rt-rarity-ssr">{ssr} SSR</span>}
			{sr > 0 && <span class="rt-rarity-count rt-rarity-sr">{sr} SR</span>}
			{r > 0 && <span class="rt-rarity-count rt-rarity-r">{r} R</span>}
		</Fragment>
	);
}

function umaSummary(umas: Uma[]) {
	const three = umas.filter(u => u.rarity === 3).length;
	const two = umas.filter(u => u.rarity === 2).length;
	const one = umas.filter(u => u.rarity === 1).length;
	return (
		<Fragment>
			<span>{umas.length} uma{umas.length === 1 ? '' : 's'}</span>
			{three > 0 && <span class="rt-rarity-count rt-rarity-ssr">{three} 3★</span>}
			{two > 0 && <span class="rt-rarity-count rt-rarity-sr">{two} 2★</span>}
			{one > 0 && <span class="rt-rarity-count rt-rarity-r">{one} 1★</span>}
		</Fragment>
	);
}

// --- Scenario Section (generic) --------------------------------------------

function ScenarioSection<T>({
	scenario,
	items,
	color,
	renderItem,
	summary,
}: {
	scenario: Scenario;
	items: T[];
	color: string;
	renderItem: (item: T) => any;
	summary: (items: T[]) => any;
}) {
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
					{summary(items)}
				</div>
				<p class="rt-section-jp">{scenario.jpName}</p>
			</header>
			<ul class="rt-card-grid">
				{items.map(renderItem)}
			</ul>
		</section>
	);
}

function PreURASection<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => any }) {
	return (
		<section class="rt-section rt-section-pre" style={{ '--rt-accent': '#555' } as any}>
			<header class="rt-section-header">
				<div class="rt-section-title">
					<h2 class="rt-section-name">Pre-URA (JP launch period)</h2>
				</div>
				<div class="rt-section-meta">
					<span>Before 2021-02-24</span>
					<span class="rt-sep">•</span>
					<span>{items.length} item{items.length === 1 ? '' : 's'}</span>
				</div>
			</header>
			<ul class="rt-card-grid">
				{items.map(renderItem)}
			</ul>
		</section>
	);
}

// --- Card Row (support card) -----------------------------------------------

function CardRow({ card, showScenario = false }: { card: Card; showScenario?: boolean }) {
	const { epithet, chara } = splitName(displayCardName(card));
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
					<AnniversaryTag attr={card} />
					<CmTag entry={card} />
					{!card.nameEn && <Badge variant="warning" size="sm" outline>JP only</Badge>}
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

function CmTag({ entry }: { entry: CmAttribution }) {
	if (entry.firstCmId === null) return null;
	const days = entry.daysToFirstCm ?? 0;
	return (
		<span
			class="rt-cm-tag"
			title={`First CM available for: #${entry.firstCmId} ${entry.firstCmName} on ${entry.firstCmStartDate} (${days}d after release)`}
		>
			→ CM#{entry.firstCmId} {entry.firstCmName}
			<span class="rt-cm-tag-days">+{days}d</span>
		</span>
	);
}

// --- Anniversary tag (shared) ----------------------------------------------

function AnniversaryTag({ attr }: { attr: AnniversaryAttribution }) {
	if (!attr.anniversaryLabel) return null;
	if (attr.isAnniversaryLaunch) {
		return <span class="rt-anniv-tag rt-anniv-tag-launch" title={attr.anniversaryTag}>★ {attr.anniversaryLabel}</span>;
	}
	const days = attr.daysFromAnniversary ?? 0;
	return (
		<span class="rt-anniv-tag" title={attr.anniversaryTag}>
			+{days}d {attr.anniversaryLabel}
		</span>
	);
}

// --- Uma Card --------------------------------------------------------------

function UmaPortrait({ uma }: { uma: Uma }) {
	const handleError = (e: h.JSX.TargetedEvent<HTMLImageElement>) => {
		const img = e.currentTarget as HTMLImageElement;
		if (img.dataset.fallback === 'true') {
			img.style.visibility = 'hidden';
			return;
		}
		img.dataset.fallback = 'true';
		img.src = umaIconFallback(uma);
	};
	return (
		<img
			class="rt-uma-portrait"
			src={umaIconUrl(uma)}
			alt={uma.nameEn}
			loading="lazy"
			onError={handleError}
		/>
	);
}

function UmaCard({ uma, showScenario = false }: { uma: Uma; showScenario?: boolean }) {
	const epithet = umaDisplayEpithet(uma);
	const scenarioColor = scenarioColorMap.get(uma.scenario) || '#888';
	return (
		<li class="rt-card rt-uma-card" style={{ '--rt-card-scenario': scenarioColor } as any}>
			<UmaPortrait uma={uma} />
			<div class="rt-card-body">
				<div class="rt-card-name" title={uma.titleJp || uma.nameJp}>
					{epithet && <span class="rt-card-epithet">{epithet}</span>}
					<span class="rt-card-chara">{uma.nameEn}</span>
				</div>
				<div class="rt-card-meta">
					<span class={`rt-uma-rarity rt-uma-rarity-${uma.rarity}`}>{uma.rarityLabel}</span>
					<span class="rt-card-date">{uma.startDate}</span>
					<AnniversaryTag attr={uma} />
					<CmTag entry={uma} />
					{!uma.titleEn && <Badge variant="warning" size="sm" outline>JP only</Badge>}
					{showScenario && (
						<span class="rt-card-scenario-tag" style={{ color: scenarioColor }}>
							{uma.scenario}
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
