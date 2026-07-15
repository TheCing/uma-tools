import { h } from 'preact';
import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { DecodedUma, decodeRoster } from './roster-decoder';
import { readRosterFromStorage, writeRosterToStorage, clearRosterStorage } from './roster-storage';
import { decodedUmaToUmaState, RosterCourse, getCharInfo } from './roster-mapping';
import { filterUmas, sortUmas, EMPTY_FILTERS, DEFAULT_SORT, FilterState, SortState } from './roster-filter';
import { RosterUmaCard } from './roster-uma-card';
import { RosterFilterPanel } from './roster-filter-panel';
import { UmaState } from '../uma-panel';
import { saveHorseSlot, getHorseSlots } from '../storage';
import skillnames from '../../skillnames.json';
import './roster.css';

export interface UmasTabProps {
	onLoadToUma1: (state: UmaState) => void;
	onLoadToUma2: (state: UmaState) => void;
	currentMode: 'compare' | 'skill' | 'stamina';
	course: RosterCourse;
}

export function UmasTab({ onLoadToUma1, onLoadToUma2, currentMode, course }: UmasTabProps) {
	const [roster, setRoster] = useState<DecodedUma[]>([]);
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState(false);
	const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
	const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
	const [filtersOpen, setFiltersOpen] = useState(false);

	useEffect(() => { readRosterFromStorage().then(setRoster); }, []);

	const handleImport = useCallback(async () => {
		if (!code.trim() || busy) return;
		setBusy(true);
		setError('');
		setNotice('');
		try {
			const decoded = await decodeRoster(code.trim());
			if (decoded.length === 0) {
				setError('Could not decode — check the code and try again.');
				return;
			}
			setRoster(decoded);
			setCode('');
			const written = await writeRosterToStorage(decoded);
			// `written.ok === true` (not bare `written.ok`) because this project's tsconfig has
			// strictNullChecks off, under which TS does not narrow a discriminated union from a
			// bare truthiness check — only from an explicit equality comparison.
			setNotice(written.ok === true
				? `Imported ${decoded.length} umas.`
				: `Imported ${decoded.length} umas, but they could not be saved (${written.reason}). They'll be gone when you reload.`);
		} catch (e) {
			setError('Could not decode — check the code and try again.');
		} finally {
			setBusy(false);
		}
	}, [code, busy]);

	const handleClear = useCallback(() => {
		setRoster([]);
		clearRosterStorage();
		setNotice('');
		setError('');
		// Otherwise a stale filter silently hides the next roster that gets imported.
		setFilters(EMPTY_FILTERS);
		setSort(DEFAULT_SORT);
		setFiltersOpen(false);
	}, []);

	const handlePromote = useCallback((uma: DecodedUma) => {
		const state = decodedUmaToUmaState(uma, course);
		const { charName, outfitName } = getCharInfo(uma.card_id);
		const base = outfitName ? `${charName} ${outfitName}` : charName;
		// saveHorseSlot keys slots by name and overwrites without asking, and a roster can
		// hold several copies of the same uma — so pick a free name rather than clobbering
		// whatever is already saved under this one.
		const existing = getHorseSlots();
		let name = base;
		for (let i = 2; name in existing; i++) name = `${base} (${i})`;
		const ok = saveHorseSlot(name, state, 'Imported from roster');
		setNotice(ok ? `Saved "${name}" to the Saved tab.` : `Could not save "${name}" — storage may be full.`);
	}, [course]);

	// Only offer skills the roster actually contains — filtering by a skill nobody owns is useless.
	const availableSkills = useMemo(() => {
		const ids = new Set<number>();
		roster.forEach(u => u.skills.forEach(s => ids.add(s.id)));
		return [...ids]
			.map(id => ({ id, name: (skillnames as any)[String(id)]?.[0] ?? `Unknown (${id})` }))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [roster]);

	const visible = useMemo(
		() => sortUmas(filterUmas(roster, filters), sort),
		[roster, filters, sort]
	);

	return (
		<div class="rosterTab">
			<div class="rosterImportBar">
				<input
					type="text"
					class="rosterInput"
					placeholder="Paste your roster share link or code…"
					value={code}
					onInput={e => setCode((e.currentTarget as HTMLInputElement).value)}
					onKeyDown={e => { if ((e as KeyboardEvent).key === 'Enter') handleImport(); }}
				/>
				<button type="button" class="rosterCardBtn" onClick={handleImport} disabled={busy || !code.trim()}>
					{busy ? 'Decoding…' : 'Import'}
				</button>
			</div>

			<div class="rosterHint">
				Export your roster at{' '}
				<a href="https://uma.guide/roster-viewer/" target="_blank" rel="noopener noreferrer">uma.guide/roster-viewer</a>
				{' '}and paste the share link here.
			</div>

			{error && <div class="rosterError">{error}</div>}
			{notice && <div class="rosterNotice">{notice}</div>}

			{roster.length > 0 && (
				<div class="rosterControls">
					<input
						type="text"
						class="rosterInput"
						placeholder="Search umas…"
						value={filters.name}
						onInput={e => setFilters({ ...filters, name: (e.currentTarget as HTMLInputElement).value })}
					/>
					<button type="button" class="rosterCardBtn rosterCardBtnGhost" onClick={() => setFiltersOpen(o => !o)}>
						{filtersOpen ? 'Hide filters' : 'Filters'}
					</button>
					<button type="button" class="rosterCardBtn rosterCardBtnGhost" onClick={handleClear} title="Remove the imported roster">
						Clear
					</button>
				</div>
			)}

			{filtersOpen && roster.length > 0 && (
				<RosterFilterPanel
					filters={filters}
					onChange={setFilters}
					sort={sort}
					onSortChange={setSort}
					availableSkills={availableSkills}
				/>
			)}

			{roster.length > 0 && (
				<div class="rosterCount">{visible.length} of {roster.length} umas</div>
			)}

			{roster.length === 0 ? (
				<div class="rosterEmpty">No roster imported yet. Paste your share link above to browse your umas.</div>
			) : visible.length === 0 ? (
				<div class="rosterEmpty">No umas match these filters.</div>
			) : (
				<div class="rosterGrid">
					{visible.map((uma, i) => (
						<RosterUmaCard
							key={`${uma.card_id}-${uma.create_time ?? ''}-${uma.rank_score ?? ''}-${i}`}
							uma={uma}
							course={course}
							showUma2={currentMode === 'compare'}
							onLoadUma1={u => onLoadToUma1(decodedUmaToUmaState(u, course))}
							onLoadUma2={u => onLoadToUma2(decodedUmaToUmaState(u, course))}
							onPromote={handlePromote}
						/>
					))}
				</div>
			)}
		</div>
	);
}
