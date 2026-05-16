/**
 * Team Trials — state serialization.
 * 5 teams (Sprint / Mile / Medium / Long / Dirt) × 3 runners each = 15 slots.
 * Each slot optionally overrides the uma's default strategy.
 * localStorage for persistence, URL hash for sharing.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

export type TeamId = 'sprint' | 'mile' | 'medium' | 'long' | 'dirt';
export type Strategy = 'front' | 'pace' | 'late' | 'end';

export const TEAMS: TeamId[] = ['sprint', 'mile', 'medium', 'long', 'dirt'];

export const TEAM_LABELS: Record<TeamId, string> = {
	sprint: 'Sprint',
	mile: 'Mile',
	medium: 'Medium',
	long: 'Long',
	dirt: 'Dirt',
};

export const SLOTS_PER_TEAM = 3;
export const SLOTS_TOTAL = TEAMS.length * SLOTS_PER_TEAM;  // 15

export interface SlotEntry {
	key: string;                  // "charaId_outfitId"
	strategy: Strategy | null;    // null = use uma's default strategy
}

export type SlotValue = SlotEntry | null;
export type TeamSlots = SlotValue[];
export type TeamsState = Record<TeamId, TeamSlots>;

// Short codes for hash encoding
const STRATEGY_CODE: Record<Strategy, string> = {
	front: 'f',
	pace: 'p',
	late: 'l',
	end: 'e',
};
const CODE_TO_STRATEGY: Record<string, Strategy> = {
	f: 'front',
	p: 'pace',
	l: 'late',
	e: 'end',
};

function emptySlots(): TeamSlots {
	return [null, null, null];
}

export function emptyState(): TeamsState {
	return {
		sprint: emptySlots(),
		mile: emptySlots(),
		medium: emptySlots(),
		long: emptySlots(),
		dirt: emptySlots(),
	};
}

const STORAGE_KEY = 'team-trials-state-v4';  // v4 = slots are { key, strategy }

export function saveLocal(state: TeamsState) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Silent — quota / disabled storage not fatal
	}
}

export function loadLocal(): TeamsState | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		return normalize(JSON.parse(raw));
	} catch {
		return null;
	}
}

// Slot serialized form: "<key>" (no override) or "<key>@f|p|l|e" (with override).
// Empty slot: "".
function serializeSlot(s: SlotValue): string {
	if (!s) return '';
	if (!s.strategy) return s.key;
	return `${s.key}@${STRATEGY_CODE[s.strategy]}`;
}

function deserializeSlot(raw: string): SlotValue {
	if (!raw) return null;
	const atIdx = raw.indexOf('@');
	if (atIdx < 0) return { key: raw, strategy: null };
	const key = raw.slice(0, atIdx);
	const code = raw.slice(atIdx + 1);
	return { key, strategy: CODE_TO_STRATEGY[code] || null };
}

// Hash format: team-slot-chunks joined by ';' per team,
// slots within a team joined by ','.
export function encodeHash(state: TeamsState): string {
	const compact = TEAMS.map(t => state[t].map(serializeSlot).join(',')).join(';');
	return btoa(compact).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeHash(hash: string): TeamsState | null {
	try {
		const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
		const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
		const compact = atob(padded);
		const chunks = compact.split(';');
		if (chunks.length !== TEAMS.length) return null;
		const state = emptyState();
		TEAMS.forEach((t, i) => {
			const slots = chunks[i].split(',');
			for (let j = 0; j < SLOTS_PER_TEAM; j++) {
				state[t][j] = deserializeSlot(slots[j] || '');
			}
		});
		return state;
	} catch {
		return null;
	}
}

function normalize(raw: any): TeamsState {
	const state = emptyState();
	if (!raw || typeof raw !== 'object') return state;
	for (const t of TEAMS) {
		if (!Array.isArray(raw[t])) continue;
		for (let j = 0; j < SLOTS_PER_TEAM; j++) {
			const v = raw[t][j];
			if (!v) {
				state[t][j] = null;
			} else if (typeof v === 'string') {
				// Back-compat with older flat-string saves
				state[t][j] = { key: v, strategy: null };
			} else if (typeof v === 'object' && typeof v.key === 'string') {
				const strat = v.strategy;
				state[t][j] = {
					key: v.key,
					strategy: (strat === 'front' || strat === 'pace' || strat === 'late' || strat === 'end')
						? strat
						: null,
				};
			} else {
				state[t][j] = null;
			}
		}
	}
	return state;
}

export function countFilled(slots: TeamSlots): number {
	let n = 0;
	for (const v of slots) if (v) n++;
	return n;
}

export function countFilledAll(state: TeamsState): number {
	let n = 0;
	for (const t of TEAMS) n += countFilled(state[t]);
	return n;
}
