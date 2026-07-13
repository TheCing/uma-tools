/**
 * CM Presets Data
 * Champions Meeting preset configurations for Global version
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import {
	GroundCondition,
	Weather,
	Season,
	Time,
} from '../../uma-skill-tools/RaceParameters';

import generatedPresets from './cm-presets.generated.json';

// Event type for presets
export const enum EventType {
	CM,
	LOH,
}

export interface Preset {
	id: number;
	type: EventType;
	name: string;
	date: string;
	courseId: number;
	season: Season;
	ground: GroundCondition;
	weather: Weather;
	time: Time;
	// false = date is a hand/MANT prediction (CM not yet in the Global client);
	// true = date pulled from the shipped Global schedule.
	confirmed?: boolean;
}

// Full CM preset list (newest first), generated from JP conditions + Global
// dates by build.mjs → cm-presets.generated.json. Used for ?preset= lookups and
// direct selection; every CM here is reachable by URL regardless of the dropdown
// window below.
export const presets: Preset[] = (generatedPresets as Preset[])
	.slice()
	.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// "Current" CM = the one whose date is closest to today (the active/imminent event).
function computeCurrentCMId(): number {
	const now = Date.now();
	let bestId = presets.length ? presets[0].id : 0;
	let bestDiff = Infinity;
	for (const p of presets) {
		const diff = Math.abs(new Date(p.date).getTime() - now);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestId = p.id;
		}
	}
	return bestId;
}

export const CURRENT_CM_ID = computeCurrentCMId();

// Dropdown shows current ± WINDOW by CM number; the rest stay URL-only.
const PRESET_WINDOW = 5;
export const visiblePresets: Preset[] = presets.filter(
	(p) => Math.abs(p.id - CURRENT_CM_ID) <= PRESET_WINDOW
);

// Default to the current CM.
export const DEFAULT_PRESET =
	presets.find((p) => p.id === CURRENT_CM_ID) ?? presets[0];
