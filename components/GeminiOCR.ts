/**
 * Gemini OCR Service for extracting horse data from screenshots
 * Uses Google's Gemini API for vision-based text extraction
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

// CRITICAL: ALWAYS import from umalator-global/ for English data, NEVER from root JP files
// This is used by the Global v2 OCR feature and must use English outfit/skill names
import skillnames from '../umalator-global/skillnames.json';
import skills from '../umalator-global/skill_data.json';
import umas from '../umalator-global/umas.json';
import { GoogleGenAI, Type } from '@google/genai';

// gemini-2.5-flash: current GA model with a free tier (gemini-flash-latest / 2.0-flash
// have no guaranteed free tier). To change the model, edit this constant here and in
// uma-tools-bot/src/gemini-ocr.ts.
const MODEL = 'gemini-2.5-flash';

// Structured-output schema → Gemini returns guaranteed-valid JSON (no markdown fences).
const RESPONSE_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		name:             { type: Type.STRING },
		outfit:           { type: Type.STRING },
		speed:            { type: Type.INTEGER },
		stamina:          { type: Type.INTEGER },
		power:            { type: Type.INTEGER },
		guts:             { type: Type.INTEGER },
		wisdom:           { type: Type.INTEGER },
		surfaceAptitude:  { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		distanceAptitude: { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		strategyAptitude: { type: Type.STRING, enum: ['S','A','B','C','D','E','F','G'] },
		strategy:         { type: Type.STRING, enum: ['Nige','Senkou','Sasi','Oikomi'] },
		skills:           { type: Type.ARRAY, items: { type: Type.STRING } },
	},
	required: ['speed','stamina','power','guts','wisdom','skills'],
	propertyOrdering: ['name','outfit','speed','stamina','power','guts','wisdom',
		'surfaceAptitude','distanceAptitude','strategyAptitude','strategy','skills'],
};

const GENERATION_CONFIG = {
	temperature: 0.1,
	topK: 1,
	topP: 0.8,
	maxOutputTokens: 4096,
	responseMimeType: 'application/json',
	responseSchema: RESPONSE_SCHEMA,
};

// OCR proxy URL set via esbuild define (CC_OCR_PROXY)
declare const CC_OCR_PROXY: string;
export const OCR_PROXY_URL: string = typeof CC_OCR_PROXY !== 'undefined' ? CC_OCR_PROXY : '';

// Build a map from normalized skill names to arrays of skill IDs
// Each skill may have multiple IDs (different grades, inherited vs base versions)
const skillNameMap: Map<string, string[]> = new Map();

function normalizeSkillName(name: string): string {
	return name.toLowerCase()
		// Remove level indicators for normalization
		.replace(/\s+(lvl|level)\s*\d+/gi, '')
		// Normalize Unicode circle variants to ○ (preserve grade indicators)
		.replace(/[◯⭕◦⃝]/g, '○')
		// Normalize all double circle variants to ◎ (preserve grade indicators)
		.replace(/[⦿⊚]/g, '◎')
		// Normalize Unicode cross variants to × (preserve grade indicators)
		.replace(/[✕✖]/g, '×')
		// Normalize trailing O/o/0 to ○ (OCR may see ○ as O/o/0, but only at end)
		.replace(/\s+[Oo0]$/g, '○')
		// Normalize trailing X/x to × (OCR may see × as X/x, but only at end)
		.replace(/\s+[Xx]$/g, '×')
		// Remove spaces, punctuation (but preserve ○◎× grade indicators)
		.replace(/[\s\-_・!！?？,、.。:：;；'"'"「」『』【】()（）\[\]☆★]/g, '')
		.trim();
}

// Check if skill name has level indicator
function hasLevelIndicator(name: string): boolean {
	return /\s+(lvl|level)\s*\d+/gi.test(name);
}

// Initialize the skill name map
(function initSkillNameMaps() {
	for (const [skillId, names] of Object.entries(skillnames)) {
		// Only include skills that exist in skill_data.json
		const baseId = skillId.split('-')[0];
		if (!skills[baseId]) continue;

		const [japaneseName, englishName] = names as [string, string];

		// Store all IDs for this skill name (normalized)
		if (japaneseName) {
			const normalized = normalizeSkillName(japaneseName);
			if (!skillNameMap.has(normalized)) {
				skillNameMap.set(normalized, []);
			}
			skillNameMap.get(normalized)!.push(skillId);
		}
		if (englishName) {
			const normalized = normalizeSkillName(englishName);
			if (!skillNameMap.has(normalized)) {
				skillNameMap.set(normalized, []);
			}
			skillNameMap.get(normalized)!.push(skillId);
		}
	}
})();

// Map skill names from OCR to skill IDs
export function mapSkillNamesToIds(skillNames: string[]): string[] {
	const mappedIds: string[] = [];

	for (const name of skillNames) {
		const normalized = normalizeSkillName(name);
		const hasLevel = hasLevelIndicator(name);

		// Get all possible IDs for this skill name
		let candidateIds = skillNameMap.get(normalized);

		if (!candidateIds) {
			// Try partial matching for skills that may have slight OCR variations
			for (const [mapName, ids] of skillNameMap.entries()) {
				if (mapName.includes(normalized) || normalized.includes(mapName)) {
					candidateIds = ids;
					break;
				}
			}
		}

		if (!candidateIds || candidateIds.length === 0) {
			continue;
		}

		// Select skill ID based on level indicator:
		// - Has level (e.g., "Dancing in the Leaves Lvl 4") → use ID starting with '1' (11xxxx unique or 10xxxx base)
		// - No level → prefer ID starting with '9' (91xxxx or 90xxxx inherited), fallback to 200xxx (passive skills)
		let skillId: string | undefined;

		if (hasLevel) {
			// Look for IDs starting with '1' (base/unique skills that show level)
			const matchingIds = candidateIds.filter(id => id.split('-')[0][0] === '1');
			if (matchingIds.length > 0) {
				skillId = matchingIds[0];
			}
		} else {
			// Look for IDs starting with '9' (inherited versions) first
			const inheritedIds = candidateIds.filter(id => id.split('-')[0][0] === '9');
			if (inheritedIds.length > 0) {
				skillId = inheritedIds[0];
			} else {
				// Fallback to any available ID (likely 200xxx passive skills)
				skillId = candidateIds[0];
			}
		}

		if (skillId) {
			mappedIds.push(skillId);
		}
	}

	return mappedIds;
}

// Build a map from normalized epithet names to outfit IDs
const epithetToOutfitMap: Map<string, string> = new Map();

function normalizeEpithet(epithet: string): string {
	return epithet.toLowerCase()
		.replace(/[\[\]「」『』【】]/g, '') // Remove brackets
		.replace(/[\s\-_・☆★♪]/g, '') // Remove spaces and special chars
		.trim();
}

// Initialize the epithet map
(function initEpithetMap() {
	for (const umaData of Object.values(umas)) {
		const outfits = (umaData as any).outfits;
		if (!outfits) continue;

		for (const [outfitId, outfitVal] of Object.entries(outfits)) {
			const epithet = typeof outfitVal === 'string' ? outfitVal : (outfitVal as any)?.epithet;
			if (epithet) {
				epithetToOutfitMap.set(normalizeEpithet(epithet), outfitId);
			}
		}
	}
})();

// Map outfit name from OCR to outfit ID
export function mapOutfitNameToId(outfit: string): string {
	if (!outfit) return '';

	const normalized = normalizeEpithet(outfit);
	const outfitId = epithetToOutfitMap.get(normalized);

	if (outfitId) {
		return outfitId;
	}

	// Try partial matching
	for (const [mapEpithet, mapId] of epithetToOutfitMap.entries()) {
		if (mapEpithet.includes(normalized) || normalized.includes(mapEpithet)) {
			return mapId;
		}
	}

	return '';
}

// Build a map from normalized character names to their default outfit IDs
const characterNameToOutfitMap: Map<string, string> = new Map();

function normalizeCharacterName(name: string): string {
	return name.toLowerCase()
		.replace(/[\s\-_・.]/g, '') // Remove spaces, dots, and special chars
		.trim();
}

// Initialize the character name map
(function initCharacterNameMap() {
	for (const [umaId, umaData] of Object.entries(umas)) {
		const name = (umaData as any).name?.[1]; // English name
		const outfits = (umaData as any).outfits;
		if (!name || !outfits) continue;

		// Get the first outfit ID as the default for this character
		const firstOutfitId = Object.keys(outfits)[0];
		if (firstOutfitId) {
			characterNameToOutfitMap.set(normalizeCharacterName(name), firstOutfitId);
		}
	}
})();

// Map character name from OCR to outfit ID (fallback when outfit name fails)
export function mapCharacterNameToOutfitId(characterName: string): string {
	if (!characterName) return '';

	const normalized = normalizeCharacterName(characterName);
	const outfitId = characterNameToOutfitMap.get(normalized);

	if (outfitId) {
		return outfitId;
	}

	// Try partial matching
	for (const [mapName, mapId] of characterNameToOutfitMap.entries()) {
		if (mapName.includes(normalized) || normalized.includes(mapName)) {
			return mapId;
		}
	}

	return '';
}

export interface OCRHorseData {
	name: string;
	outfit: string;
	speed: number;
	stamina: number;
	power: number;
	guts: number;
	wisdom: number;
	surfaceAptitude: string;
	distanceAptitude: string;
	strategyAptitude: string;
	strategy: string;
	skills: string[];
}

export interface OCRResult {
	success: boolean;
	data?: OCRHorseData;
	error?: string;
	rawResponse?: string;
}

const EXTRACTION_PROMPT = `Analyze this Uma Musume game screenshot and extract the horse's data into the provided JSON schema.

Field guidance:
- name: character name (e.g., 'El Condor Pasa', 'Taiki Shuttle')
- outfit: outfit name in brackets (e.g., '[El☆Número 1]', '[Wild Frontier]')
- speed / stamina / power / guts / wisdom: the numeric stat values (wisdom = the Wit stat)
- surfaceAptitude: the letter grade for Turf (S–G)
- distanceAptitude: the BEST grade among Sprint / Mile / Medium / Long
- strategyAptitude: the BEST grade among Front / Pace / Late / End styles
- strategy: the style name with the best grade, mapped as:
    Front / Front Runner = "Nige"
    Pace / Pace Chaser = "Senkou"
    Late / Late Surger = "Sasi"
    End / End Closer = "Oikomi"

Extract ALL visible skill names from the Skills tab, exactly as shown, including:
- Any circle/cross symbols (○, ◎, ×) after the name — these indicate the skill grade and are part of the name.
- The level indicator (Lvl 1–4) if present — CRITICAL for telling UNIQUE skills (which DISPLAY "Lvl X", usually Lvl 4) apart from INHERITED skills (which do NOT show a level).

Examples:
- "Dancing in the Leaves Lvl 4" (HAS level) = unique skill
- "Dancing in the Leaves" (NO level) = inherited skill`;

// SDK baseUrl for the proxy path. The SDK appends /v1beta/models/<model>:generateContent.
function proxyBaseUrl(): string {
	const base = OCR_PROXY_URL.replace(/\/+$/, '');
	return base.endsWith('/gemini') ? base : base + '/gemini';
}

function buildContents(imageBase64: string, mimeType: string) {
	return [{
		role: 'user',
		parts: [
			{ inlineData: { mimeType, data: imageBase64 } },
			{ text: EXTRACTION_PROMPT },
		],
	}];
}

async function runExtraction(ai: GoogleGenAI, imageBase64: string, mimeType: string): Promise<OCRResult> {
	const resp = await ai.models.generateContent({
		model: MODEL,
		contents: buildContents(imageBase64, mimeType),
		config: GENERATION_CONFIG,
	});

	const text = resp.text;
	if (!text) {
		throw new Error('No response content from Gemini');
	}

	let data: OCRHorseData;
	try {
		data = JSON.parse(text);
	} catch (parseError) {
		throw new Error(`Invalid JSON from AI: ${parseError instanceof Error ? parseError.message : 'Parse error'}`);
	}

	if (typeof data.speed !== 'number' ||
		typeof data.stamina !== 'number' ||
		typeof data.power !== 'number' ||
		typeof data.guts !== 'number' ||
		typeof data.wisdom !== 'number') {
		throw new Error('Invalid stat values in response');
	}

	return { success: true, data, rawResponse: text };
}

export async function extractHorseDataFromImage(
	imageBase64: string,
	mimeType: string,
	apiKey: string
): Promise<OCRResult> {
	// Try the server proxy first (no user key needed). 'proxy' is a placeholder the
	// worker ignores — it injects the real server key.
	if (OCR_PROXY_URL) {
		try {
			const ai = new GoogleGenAI({ apiKey: 'proxy', httpOptions: { baseUrl: proxyBaseUrl() } });
			return await runExtraction(ai, imageBase64, mimeType);
		} catch (err) {
			console.warn('OCR proxy failed — falling back to user key:', err instanceof Error ? err.message : err);
		}
	}

	// Fall back to a direct call with the user's key.
	if (!apiKey) {
		return {
			success: false,
			error: OCR_PROXY_URL
				? 'OCR server is temporarily unavailable. Please try again later or provide your own Gemini API key.'
				: 'Please enter your Gemini API key.',
		};
	}

	try {
		const ai = new GoogleGenAI({ apiKey });
		return await runExtraction(ai, imageBase64, mimeType);
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}

// Convert File to base64
export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
			const base64 = result.split(',')[1];
			resolve({ base64, mimeType: file.type });
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsDataURL(file);
	});
}

// Store API key in localStorage
const API_KEY_STORAGE_KEY = 'gemini_api_key';

export function getStoredApiKey(): string | null {
	try {
		return localStorage.getItem(API_KEY_STORAGE_KEY);
	} catch {
		return null;
	}
}

export function storeApiKey(apiKey: string): void {
	try {
		localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
	} catch {
		// localStorage not available
	}
}

export function clearStoredApiKey(): void {
	try {
		localStorage.removeItem(API_KEY_STORAGE_KEY);
	} catch {
		// localStorage not available
	}
}
