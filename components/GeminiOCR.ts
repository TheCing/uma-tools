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

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

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

		for (const [outfitId, epithet] of Object.entries(outfits)) {
			if (typeof epithet === 'string') {
				const normalized = normalizeEpithet(epithet);
				epithetToOutfitMap.set(normalized, outfitId);
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

const EXTRACTION_PROMPT = `Analyze this Uma Musume game screenshot and extract the horse's data.

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "name": "character name (e.g., 'El Condor Pasa', 'Taiki Shuttle')",
  "outfit": "outfit name in brackets (e.g., '[El☆Número 1]', '[Wild Frontier]')",
  "speed": <number - the Speed stat value>,
  "stamina": <number - the Stamina stat value>,
  "power": <number - the Power stat value>,
  "guts": <number - the Guts stat value>,
  "wisdom": <number - the Wit/Wisdom stat value>,
  "surfaceAptitude": "<letter grade for Turf: S, A, B, C, D, E, F, or G>",
  "distanceAptitude": "<letter grade - use the BEST grade among Sprint/Mile/Medium/Long>",
  "strategyAptitude": "<letter grade - use the BEST grade among Front/Pace/Late/End styles>",
  "strategy": "<style name with the best grade: 'Nige' for Front, 'Senkou' for Pace, 'Sasi' for Late, 'Oikomi' for End>",
  "skills": ["skill name 1", "skill name 2", ...]
}

Important mappings:
- Style "Front" or "Front Runner" = strategy "Nige"
- Style "Pace" or "Pace Chaser" = strategy "Senkou"
- Style "Late" or "Late Surger" = strategy "Sasi"
- Style "End" or "End Closer" = strategy "Oikomi"

Extract ALL visible skill names from the Skills tab. Include the skill names exactly as shown, including:
- Any circle symbols (○, ◎, ×) that appear after the skill name - these are part of the skill name indicating skill grade
- The level indicator (Lvl 1, Lvl 2, Lvl 3, Lvl 4) if present - this is CRITICAL for distinguishing unique skills (which SHOW level) from inherited skills (which do NOT show level)

IMPORTANT: UNIQUE skills DISPLAY a level indicator (usually Lvl 4). INHERITED skills do NOT show "Lvl X" - just the skill name.

Examples:
- "Dancing in the Leaves Lvl 4" (HAS level) = unique skill
- "Dancing in the Leaves" (NO level) = inherited skill`;

function buildRequestBody(imageBase64: string, mimeType: string) {
	return {
		contents: [{
			parts: [
				{ inline_data: { mime_type: mimeType, data: imageBase64 } },
				{ text: EXTRACTION_PROMPT }
			]
		}],
		generationConfig: {
			temperature: 0.1,
			topK: 1,
			topP: 0.8,
			maxOutputTokens: 4096,
		}
	};
}

function parseGeminiResponse(result: any): OCRResult {
	const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

	if (!textContent) {
		throw new Error('No response content from Gemini API');
	}

	let jsonStr = textContent.trim();

	if (jsonStr.startsWith('```json')) {
		jsonStr = jsonStr.slice(7);
	} else if (jsonStr.startsWith('```')) {
		jsonStr = jsonStr.slice(3);
	}
	if (jsonStr.endsWith('```')) {
		jsonStr = jsonStr.slice(0, -3);
	}
	jsonStr = jsonStr.trim();

	if (!jsonStr.endsWith('}')) {
		console.error('Truncated JSON response:', jsonStr);
		throw new Error(`AI response appears truncated (doesn't end with }). This may be due to token limits or API issues.\n\nReceived ${jsonStr.length} characters. Response ends with: "${jsonStr.slice(-50)}"`);
	}

	let horseData: OCRHorseData;
	try {
		horseData = JSON.parse(jsonStr);
	} catch (parseError) {
		console.error('Failed to parse JSON response:', jsonStr);
		throw new Error(`Invalid JSON from AI: ${parseError instanceof Error ? parseError.message : 'Parse error'}\n\nRaw response (first 200 chars):\n${jsonStr.slice(0, 200)}...`);
	}

	if (typeof horseData.speed !== 'number' ||
		typeof horseData.stamina !== 'number' ||
		typeof horseData.power !== 'number' ||
		typeof horseData.guts !== 'number' ||
		typeof horseData.wisdom !== 'number') {
		throw new Error('Invalid stat values in response');
	}

	return { success: true, data: horseData, rawResponse: textContent };
}

async function callGeminiDirect(requestBody: any, apiKey: string): Promise<Response> {
	return fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(requestBody),
	});
}

async function callGeminiProxy(requestBody: any): Promise<Response> {
	return fetch(OCR_PROXY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(requestBody),
	});
}

export async function extractHorseDataFromImage(
	imageBase64: string,
	mimeType: string,
	apiKey: string
): Promise<OCRResult> {
	const requestBody = buildRequestBody(imageBase64, mimeType);

	// Try server proxy first (no user key needed)
	if (OCR_PROXY_URL) {
		try {
			const response = await callGeminiProxy(requestBody);
			if (response.ok) {
				return parseGeminiResponse(await response.json());
			}
			// Proxy failed (rate limit, misconfigured, etc.) — fall through to direct
			console.warn('OCR proxy returned', response.status, '— falling back to user key');
		} catch (err) {
			console.warn('OCR proxy unreachable — falling back to user key');
		}
	}

	// Fall back to direct API call with user's key
	try {
		const response = await callGeminiDirect(requestBody, apiKey);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error((errorData as any).error?.message || `API request failed with status ${response.status}`);
		}

		return parseGeminiResponse(await response.json());
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
			rawResponse: undefined
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
