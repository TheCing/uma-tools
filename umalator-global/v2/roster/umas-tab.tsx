import { h } from 'preact';
import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { DecodedUma, decodeRoster } from './roster-decoder';
import { parseRosterJson } from './roster-json';
import { readRosterFromStorage, writeRosterToStorage, clearRosterStorage } from './roster-storage';
import { decodedUmaToUmaState, RosterCourse, getCharInfo } from './roster-mapping';
import { filterUmas, sortUmas, EMPTY_FILTERS, DEFAULT_SORT, FilterState, SortState } from './roster-filter';
import { RosterUmaCard } from './roster-uma-card';
import { RosterFilterPanel } from './roster-filter-panel';
import { UmaState } from '../uma-panel';
import { saveHorseSlot, getHorseSlots } from '../storage';
import { Button, Input } from '../components';
import skillnames from '../../skillnames.json';
import './roster.css';

/**
 * Persistent Umas-tab state. Lives in app-v2 because this tab is conditionally rendered and
 * therefore unmounts on every tab switch — and Load deliberately switches tabs, so keeping
 * this local would discard the user's roster, filters and sort on the primary workflow.
 * Ephemeral UI (paste box, error/notice, busy) stays local and is meant to reset.
 */
export interface UmasTabState {
	roster: DecodedUma[];
	filters: FilterState;
	sort: SortState;
	filtersOpen: boolean;
	/** Whether the one-time localStorage read has happened, so remounts don't re-gunzip. */
	loaded: boolean;
}

export const initialUmasTabState: UmasTabState = {
	roster: [],
	filters: EMPTY_FILTERS,
	sort: DEFAULT_SORT,
	filtersOpen: false,
	loaded: false
};

export interface UmasTabProps {
	state: UmasTabState;
	onStateChange: (next: UmasTabState) => void;
	onLoadToUma1: (state: UmaState) => void;
	onLoadToUma2: (state: UmaState) => void;
	currentMode: 'compare' | 'skill' | 'stamina';
	course: RosterCourse;
}

export function UmasTab({ state, onStateChange, onLoadToUma1, onLoadToUma2, currentMode, course }: UmasTabProps) {
	const { roster, filters, sort, filtersOpen } = state;
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState(false);

	// Read localStorage once per session, not on every remount — this tab unmounts whenever
	// the user switches drawer tabs, and re-gunzipping on each visit also flashed the empty
	// state before the roster reappeared.
	useEffect(() => {
		if (state.loaded) return;
		readRosterFromStorage().then(roster => onStateChange({ ...state, roster, loaded: true }));
	}, [state.loaded]);

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
			onStateChange({ ...state, roster: decoded });
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
	}, [code, busy, state, onStateChange]);

	const handleImportFile = useCallback(() => {
		if (busy) return;
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			setBusy(true);
			setError('');
			setNotice('');
			try {
				// ~5MB of JSON; reading + parsing is why the button shows a pending state.
				const decoded = parseRosterJson(await file.text());
				if (decoded.length === 0) {
					setError("Couldn't read that file — pick your UmaExtractor data.json.");
					return;
				}
				onStateChange({ ...state, roster: decoded, loaded: true });
				const written = await writeRosterToStorage(decoded);
				// `written.ok === true` (not bare `written.ok`) — see handleImport above for why
				// this project's tsconfig needs the explicit equality check to narrow the union.
				setNotice(written.ok === true
					? `Imported ${decoded.length} umas from ${file.name}.`
					: `Imported ${decoded.length} umas, but they could not be saved (${written.reason}). They'll be gone when you reload.`);
			} catch {
				setError("Couldn't read that file — pick your UmaExtractor data.json.");
			} finally {
				setBusy(false);
			}
		};
		input.click();
	}, [busy, state, onStateChange]);

	const handleClear = useCallback(() => {
		clearRosterStorage();
		setNotice('');
		setError('');
		// Otherwise a stale filter silently hides the next roster that gets imported.
		onStateChange({ ...state, roster: [], filters: EMPTY_FILTERS, sort: DEFAULT_SORT, filtersOpen: false });
	}, [state, onStateChange]);

	const handlePromote = useCallback((uma: DecodedUma) => {
		const umaState = decodedUmaToUmaState(uma, course);
		const { charName, outfitName } = getCharInfo(uma.card_id);
		const base = outfitName ? `${charName} ${outfitName}` : charName;
		// saveHorseSlot keys slots by name and overwrites without asking, and a roster can
		// hold several copies of the same uma — so pick a free name rather than clobbering
		// whatever is already saved under this one.
		const existing = getHorseSlots();
		let name = base;
		for (let i = 2; name in existing; i++) name = `${base} (${i})`;
		const ok = saveHorseSlot(name, umaState, 'Imported from roster');
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

	// A stale or unknown courseId — e.g. from an old shared link or a saved session whose
	// course no longer exists in course_data.json — leaves this undefined. Without a guard,
	// decodedUmaToUmaState would throw on course.surface, and v2 has no error boundary, so
	// it would white-screen the whole app rather than just this tab.
	if (!course) {
		return (
			<div class="rosterTab">
				<div class="rosterEmpty">Select a valid track and course to browse your roster.</div>
			</div>
		);
	}

	return (
		<div class="rosterTab">
			<div class="rosterImportFile">
				<Button variant="primary" onClick={handleImportFile} disabled={busy}>
					{busy ? 'Reading…' : 'Import data.json'}
				</Button>
				<span class="rosterHint">
					Your roster export from UmaExtractor. Nothing leaves your browser.
				</span>
			</div>

			<details class="rosterPasteFallback">
				<summary>Or paste a share link</summary>
				<div class="rosterImportBar">
					<Input
						className="rosterImportInput"
						placeholder="Paste your roster share link or code…"
						value={code}
						onInput={setCode}
					/>
					<Button variant="secondary" onClick={handleImport} disabled={busy || !code.trim()}>
						{busy ? 'Decoding…' : 'Import'}
					</Button>
				</div>
				<span class="rosterHint">
					Export at <a href="https://uma.guide/roster-viewer/" target="_blank" rel="noopener noreferrer">uma.guide/roster-viewer</a>.
					A share link has no training dates, so "Newest" falls back to export order.
				</span>
			</details>

			{error && <div class="rosterError">{error}</div>}
			{notice && <div class="rosterNotice">{notice}</div>}

			{roster.length > 0 && (
				<div class="rosterControls">
					<Input
						className="rosterSearchInput"
						placeholder="Search umas…"
						value={filters.name}
						onInput={name => onStateChange({ ...state, filters: { ...filters, name } })}
					/>
					<Button variant="secondary" onClick={() => onStateChange({ ...state, filtersOpen: !filtersOpen })}>
						{filtersOpen ? 'Hide filters' : 'Filters'}
					</Button>
					<Button variant="secondary" onClick={handleClear} title="Remove the imported roster">
						Clear
					</Button>
				</div>
			)}

			{filtersOpen && roster.length > 0 && (
				<RosterFilterPanel
					filters={filters}
					onChange={f => onStateChange({ ...state, filters: f })}
					sort={sort}
					onSortChange={s => onStateChange({ ...state, sort: s })}
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
