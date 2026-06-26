import { readFileSync } from 'fs';
import { join } from 'path';
import { GoogleGenAI, Type } from '@google/genai';

// gemini-2.5-flash: free-tier GA model. Keep in sync with components/GeminiOCR.ts.
const MODEL = 'gemini-2.5-flash';

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

// Load data files
const dataDir = join(__dirname, '..', 'data');
const skillnames: Record<string, [string, string]> = JSON.parse(readFileSync(join(dataDir, 'skillnames.json'), 'utf-8'));
const skills: Record<string, any> = JSON.parse(readFileSync(join(dataDir, 'skill_data.json'), 'utf-8'));
const umas: Record<string, any> = JSON.parse(readFileSync(join(dataDir, 'umas.json'), 'utf-8'));

// Build skill name → IDs map
const skillNameMap: Map<string, string[]> = new Map();

function normalizeSkillName(name: string): string {
	return name.toLowerCase()
		.replace(/\s+(lvl|level)\s*\d+/gi, '')
		.replace(/[◯⭕◦⃝]/g, '○')
		.replace(/[⦿⊚]/g, '◎')
		.replace(/[✕✖]/g, '×')
		.replace(/\s+[Oo0]$/g, '○')
		.replace(/\s+[Xx]$/g, '×')
		.replace(/[\s\-_・!！?？,、.。:：;；'"'"「」『』【】()（）\[\]☆★]/g, '')
		.trim();
}

function hasLevelIndicator(name: string): boolean {
	return /\s+(lvl|level)\s*\d+/gi.test(name);
}

// Initialize skill name map
for (const [skillId, names] of Object.entries(skillnames)) {
	const baseId = skillId.split('-')[0];
	if (!skills[baseId]) continue;

	const [japaneseName, englishName] = names;

	if (japaneseName) {
		const normalized = normalizeSkillName(japaneseName);
		if (!skillNameMap.has(normalized)) skillNameMap.set(normalized, []);
		skillNameMap.get(normalized)!.push(skillId);
	}
	if (englishName) {
		const normalized = normalizeSkillName(englishName);
		if (!skillNameMap.has(normalized)) skillNameMap.set(normalized, []);
		skillNameMap.get(normalized)!.push(skillId);
	}
}

export function mapSkillNamesToIds(skillNames: string[]): string[] {
	const mappedIds: string[] = [];

	for (const name of skillNames) {
		const normalized = normalizeSkillName(name);
		const hasLevel = hasLevelIndicator(name);

		let candidateIds = skillNameMap.get(normalized);

		if (!candidateIds) {
			for (const [mapName, ids] of skillNameMap.entries()) {
				if (mapName.includes(normalized) || normalized.includes(mapName)) {
					candidateIds = ids;
					break;
				}
			}
		}

		if (!candidateIds || candidateIds.length === 0) continue;

		let skillId: string | undefined;

		if (hasLevel) {
			const matchingIds = candidateIds.filter(id => id.split('-')[0][0] === '1');
			if (matchingIds.length > 0) skillId = matchingIds[0];
		} else {
			const inheritedIds = candidateIds.filter(id => id.split('-')[0][0] === '9');
			if (inheritedIds.length > 0) {
				skillId = inheritedIds[0];
			} else {
				skillId = candidateIds[0];
			}
		}

		if (skillId) mappedIds.push(skillId);
	}

	return mappedIds;
}

// Build epithet → outfit ID map
const epithetToOutfitMap: Map<string, string> = new Map();

function normalizeEpithet(epithet: string): string {
	return epithet.toLowerCase()
		.replace(/[\[\]「」『』【】]/g, '')
		.replace(/[\s\-_・☆★♪]/g, '')
		.trim();
}

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

export function mapOutfitNameToId(outfit: string): string {
	if (!outfit) return '';
	const normalized = normalizeEpithet(outfit);
	const outfitId = epithetToOutfitMap.get(normalized);
	if (outfitId) return outfitId;

	for (const [mapEpithet, mapId] of epithetToOutfitMap.entries()) {
		if (mapEpithet.includes(normalized) || normalized.includes(mapEpithet)) {
			return mapId;
		}
	}
	return '';
}

// Character name → outfit ID fallback
const characterNameToOutfitMap: Map<string, string> = new Map();

function normalizeCharacterName(name: string): string {
	return name.toLowerCase().replace(/[\s\-_・.]/g, '').trim();
}

for (const [_umaId, umaData] of Object.entries(umas)) {
	const name = (umaData as any).name?.[1];
	const outfits = (umaData as any).outfits;
	if (!name || !outfits) continue;
	const firstOutfitId = Object.keys(outfits)[0];
	if (firstOutfitId) {
		characterNameToOutfitMap.set(normalizeCharacterName(name), firstOutfitId);
	}
}

export function mapCharacterNameToOutfitId(characterName: string): string {
	if (!characterName) return '';
	const normalized = normalizeCharacterName(characterName);
	const outfitId = characterNameToOutfitMap.get(normalized);
	if (outfitId) return outfitId;

	for (const [mapName, mapId] of characterNameToOutfitMap.entries()) {
		if (mapName.includes(normalized) || normalized.includes(mapName)) {
			return mapId;
		}
	}
	return '';
}

export function getUmaName(outfitId: string): string | null {
	if (!outfitId) return null;
	const umaId = outfitId.slice(0, 4);
	const uma = umas[umaId];
	if (!uma) return null;
	return uma.name?.[1] || uma.name?.[0] || null;
}

export function getOutfitName(outfitId: string): string | null {
	if (!outfitId) return null;
	const umaId = outfitId.slice(0, 4);
	const uma = umas[umaId];
	if (!uma?.outfits) return null;
	const o = uma.outfits[outfitId];
	return o ? (typeof o === 'string' ? o : o.epithet) : null;
}

export function getSkillName(skillId: string): string | null {
	const names = skillnames[skillId];
	if (!names) return null;
	return names[1] || names[0] || null;
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

export async function extractHorseDataFromImage(
	imageBase64: string,
	mimeType: string,
	apiKey: string
): Promise<OCRResult> {
	try {
		const ai = new GoogleGenAI({ apiKey });
		const resp = await ai.models.generateContent({
			model: MODEL,
			contents: [{
				role: 'user',
				parts: [
					{ inlineData: { mimeType, data: imageBase64 } },
					{ text: EXTRACTION_PROMPT },
				],
			}],
			config: {
				temperature: 0.1,
				topK: 1,
				topP: 0.8,
				maxOutputTokens: 4096,
				responseMimeType: 'application/json',
				responseSchema: RESPONSE_SCHEMA,
			},
		});

		const text = resp.text;
		if (!text) {
			throw new Error('No response content from Gemini');
		}

		const horseData: OCRHorseData = JSON.parse(text);

		if (typeof horseData.speed !== 'number' ||
			typeof horseData.stamina !== 'number' ||
			typeof horseData.power !== 'number' ||
			typeof horseData.guts !== 'number' ||
			typeof horseData.wisdom !== 'number') {
			throw new Error('Invalid stat values in response');
		}

		return { success: true, data: horseData };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}
