// Gemini OCR Service for extracting horse data from screenshots
// Uses Google's Gemini API for vision-based text extraction

import skillnames from '../uma-skill-tools/data/skillnames.json';
import skills from '../uma-skill-tools/data/skill_data.json';
import umas from '../umas.json';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// Build a map from normalized skill names to skill IDs
// Includes both Japanese and English names
const skillNameToIdMap: Map<string, string> = new Map();

function normalizeSkillName(name: string): string {
	return name.toLowerCase()
		.replace(/[\s\-_・!！?？,、.。:：;；'"'"「」『』【】()（）\[\]☆★]/g, '')
		.trim();
}

// Initialize the skill name map
(function initSkillNameMap() {
	for (const [skillId, names] of Object.entries(skillnames)) {
		// Only include skills that exist in skill_data.json
		if (!skills[skillId.split('-')[0]]) continue;

		const [japaneseName, englishName] = names as [string, string];

		if (japaneseName) {
			skillNameToIdMap.set(normalizeSkillName(japaneseName), skillId);
		}
		if (englishName) {
			skillNameToIdMap.set(normalizeSkillName(englishName), skillId);
		}
	}
})();

// Map skill names from OCR to skill IDs
export function mapSkillNamesToIds(skillNames: string[]): string[] {
	const mappedIds: string[] = [];

	for (const name of skillNames) {
		const normalized = normalizeSkillName(name);
		const skillId = skillNameToIdMap.get(normalized);

		if (skillId) {
			mappedIds.push(skillId);
		} else {
			// Try partial matching for skills that may have slight OCR variations
			for (const [mapName, mapId] of skillNameToIdMap.entries()) {
				if (mapName.includes(normalized) || normalized.includes(mapName)) {
					mappedIds.push(mapId);
					break;
				}
			}
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
	for (const [umaId, umaData] of Object.entries(umas)) {
		const outfits = (umaData as any).outfits;
		if (!outfits) continue;

		for (const [outfitId, epithet] of Object.entries(outfits)) {
			if (typeof epithet === 'string') {
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

	console.log('Could not find outfit ID for:', outfit);
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

Extract ALL visible skill names from the Skills tab. Only include the skill names, not levels or icons.`;

export async function extractHorseDataFromImage(
	imageBase64: string,
	mimeType: string,
	apiKey: string
): Promise<OCRResult> {
	try {
		const requestBody = {
			contents: [{
				parts: [
					{
						inline_data: {
							mime_type: mimeType,
							data: imageBase64
						}
					},
					{
						text: EXTRACTION_PROMPT
					}
				]
			}],
			generationConfig: {
				temperature: 0.1,
				topK: 1,
				topP: 0.8,
				maxOutputTokens: 2048,
			}
		};

		const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
		}

		const result = await response.json();

		// Extract the text response
		const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

		if (!textContent) {
			throw new Error('No response content from Gemini API');
		}

		// Try to parse the JSON from the response
		// Sometimes the model might wrap it in markdown code blocks
		let jsonStr = textContent.trim();

		// Remove markdown code blocks if present
		if (jsonStr.startsWith('```json')) {
			jsonStr = jsonStr.slice(7);
		} else if (jsonStr.startsWith('```')) {
			jsonStr = jsonStr.slice(3);
		}
		if (jsonStr.endsWith('```')) {
			jsonStr = jsonStr.slice(0, -3);
		}
		jsonStr = jsonStr.trim();

		const horseData: OCRHorseData = JSON.parse(jsonStr);

		// Validate required fields
		if (typeof horseData.speed !== 'number' ||
			typeof horseData.stamina !== 'number' ||
			typeof horseData.power !== 'number' ||
			typeof horseData.guts !== 'number' ||
			typeof horseData.wisdom !== 'number') {
			throw new Error('Invalid stat values in response');
		}

		return {
			success: true,
			data: horseData,
			rawResponse: textContent
		};

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
