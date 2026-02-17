/**
 * CM Presets Data
 * Champions Meeting preset configurations for Global version
 */

import {
	GroundCondition,
	Weather,
	Season,
	Time,
} from '../../uma-skill-tools/RaceParameters';

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
}

// CM presets data (Global version)
export const presets: Preset[] = [
	{
		id: 11,
		type: EventType.CM,
		name: 'Pisces Cup',
		date: '2026-03-31',
		courseId: 10914,
		season: Season.Spring,
		ground: GroundCondition.Heavy,
		weather: Weather.Rainy,
		time: Time.Midday,
	},
	{
		id: 10,
		type: EventType.CM,
		name: 'Aquarius Cup',
		date: '2026-03-06',
		courseId: 10611,
		season: Season.Winter,
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
	{
		id: 9,
		type: EventType.CM,
		name: 'Capricorn Cup',
		date: '2026-02-13',
		courseId: 10701,
		season: Season.Winter,
		ground: GroundCondition.Soft,
		weather: Weather.Snowy,
		time: Time.Midday,
	},
	{
		id: 8,
		type: EventType.CM,
		name: 'Sagittarius Cup',
		date: '2026-01-22',
		courseId: 10506,
		season: Season.Winter,
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
	{
		id: 7,
		type: EventType.CM,
		name: 'Scorpio Cup',
		date: '2026-01',
		courseId: 10604,
		season: Season.Autumn,
		ground: GroundCondition.Soft,
		weather: Weather.Rainy,
		time: Time.Midday,
	},
	{
		id: 6,
		type: EventType.CM,
		name: 'Libra Cup',
		date: '2025-12',
		courseId: 10810,
		season: Season.Autumn,
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
	{
		id: 5,
		type: EventType.CM,
		name: 'Virgo Cup',
		date: '2025-11-20',
		courseId: 10903,
		season: Season.Autumn,
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
	{
		id: 4,
		type: EventType.CM,
		name: 'Leo Cup',
		date: '2025-10-30',
		courseId: 10906,
		season: Season.Summer,
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
	{
		id: 3,
		type: EventType.CM,
		name: 'Cancer Cup',
		date: '2025-10-07',
		courseId: 10602,
		season: Season.Summer,
		ground: GroundCondition.Yielding,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
	{
		id: 2,
		type: EventType.CM,
		name: 'Gemini Cup',
		date: '2025-09',
		courseId: 10811,
		season: Season.Spring,
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
	{
		id: 1,
		type: EventType.CM,
		name: 'Taurus Cup',
		date: '2025-08',
		courseId: 10606,
		season: Season.Spring,
		ground: GroundCondition.Good,
		weather: Weather.Sunny,
		time: Time.Midday,
	},
].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// Find current/most recent preset
export const DEFAULT_PRESET =
	presets[
		Math.max(
			presets.findIndex(
				((now) => (p) =>
					new Date(
						new Date(p.date).getFullYear(),
						new Date(p.date).getUTCMonth() + 1,
						0
					) < now)(new Date())
			) - 1,
			0
		)
	];
