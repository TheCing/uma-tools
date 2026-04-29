#!/usr/bin/env ts-node

/**
 * Fast Forward Global Data Tool
 *
 * Generates Global data files that include JP content. Supports two cutoff modes:
 *   1. Date-based:  --through-date / --through-scenario / --through-anniversary / --through-cm
 *                   Cutoff resolves to a JP-server date; uma inclusion derived from
 *                   docs/jp-uma-releases.json. Skills default to all-new (Infinity).
 *   2. Numeric ID:  --max-skill-id / --max-uma-id (legacy explicit thresholds)
 *
 * Always preserves existing Global data and only adds NEW entries.
 *
 * Usage:
 *   # Date-based (recommended)
 *   ts-node tools/fast-forward-global.ts --through-date 2024-12-31 --dry-run
 *   ts-node tools/fast-forward-global.ts --through-anniversary 4th --backup
 *   ts-node tools/fast-forward-global.ts --through-scenario UAF
 *   ts-node tools/fast-forward-global.ts --through-cm 24
 *
 *   # Legacy numeric
 *   ts-node tools/fast-forward-global.ts --max-skill-id 220000 --max-uma-id 1050
 *
 *   # Restore
 *   ts-node tools/fast-forward-global.ts --restore-backup
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { program } from 'commander';

// ============================================================================
// Configuration Interface
// ============================================================================

interface FastForwardConfig {
	maxSkillId: number;
	maxUmaId: number;
	eligibleUmaIds: Set<number> | null;  // Date-mode authoritative inclusion set (null in legacy mode)
	outputDir: string;
	createBackup: boolean;
	restoreBackup: boolean;
	dryRun: boolean;
	cutoffDate: string | null;     // Resolved cutoff date (YYYY-MM-DD), if any
	cutoffSource: string | null;   // Human-readable description of how cutoff was derived
	strictSkillDates: boolean;     // If true, undated skills are EXCLUDED (default: include)
}

// ============================================================================
// Constants
// ============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const JP_DATA_DIR = path.join(PROJECT_ROOT, 'uma-skill-tools', 'data');
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'umalator-global');

const DATA_FILES = {
	skillData: 'skill_data.json',
	skillNames: 'skillnames.json',
	skillMeta: 'skill_meta.json',
	umas: 'umas.json'
};

// Reference data files used to resolve date-based cutoffs
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');
const REF_FILES = {
	umaReleases: path.join(DOCS_DIR, 'jp-uma-releases.json'),
	skillReleases: path.join(DOCS_DIR, 'jp-skill-release-dates.json'),
	scenarios: path.join(DOCS_DIR, 'jp-scenarios.json'),
	anniversaries: path.join(DOCS_DIR, 'jp-anniversaries.json'),
	championsMeetings: path.join(DOCS_DIR, 'jp-champions-meetings.json'),
};

const GLOBAL_MASTER_MDB = path.join(DOCS_DIR, 'master.mdb');
const MANIFEST_FILE_NAME = 'fast-forward-log.json';

// ============================================================================
// master.mdb cross-check (informational)
// ============================================================================

interface MasterMdbDelta {
	umasNotOnGlobal: number[];   // chara IDs in JSON but not in master.mdb (fast-forwarded ahead)
	skillsNotOnGlobal: number[]; // skill IDs in JSON but not in master.mdb
}

/**
 * Diff JSON entries against the actual Global master.mdb to surface entries
 * that have been fast-forwarded ahead of the live Global server. Returns null
 * if master.mdb isn't available.
 */
function diffJsonAgainstMasterMdb(args: {
	jsonUmas: Record<string, any>;
	jsonSkills: Record<string, any>;
}): MasterMdbDelta | null {
	if (!fs.existsSync(GLOBAL_MASTER_MDB)) return null;
	try {
		const charaRaw = execSync(`sqlite3 "${GLOBAL_MASTER_MDB}" "SELECT id FROM chara_data"`, { encoding: 'utf-8' });
		const skillRaw = execSync(`sqlite3 "${GLOBAL_MASTER_MDB}" "SELECT id FROM skill_data"`, { encoding: 'utf-8' });
		const liveCharaIds = new Set(charaRaw.trim().split('\n').map(s => parseInt(s, 10)).filter(n => !isNaN(n)));
		const liveSkillIds = new Set(skillRaw.trim().split('\n').map(s => parseInt(s, 10)).filter(n => !isNaN(n)));

		const umasNotOnGlobal: number[] = [];
		for (const id of Object.keys(args.jsonUmas)) {
			const n = parseInt(id);
			if (!liveCharaIds.has(n)) umasNotOnGlobal.push(n);
		}
		const skillsNotOnGlobal: number[] = [];
		for (const id of Object.keys(args.jsonSkills)) {
			const n = parseInt(id);
			if (!liveSkillIds.has(n)) skillsNotOnGlobal.push(n);
		}
		return { umasNotOnGlobal, skillsNotOnGlobal };
	} catch (e: any) {
		console.warn(`  [warn] master.mdb cross-check failed: ${e.message}`);
		return null;
	}
}

// ============================================================================
// Manifest (audit log + firstSeen map)
// ============================================================================

interface ManifestEntry {
	timestamp: string;
	cutoffSource: string | null;
	cutoffDate: string | null;
	maxUmaId: number;
	maxSkillId: number | null;   // null means "no cap"
	addedUmaIds: number[];
	addedSkillIds: number[];
	counts: { umas: number; skills: number };
}

interface Manifest {
	description: string;
	lastRun: string | null;
	history: ManifestEntry[];
	firstSeen: {
		umas: Record<string, string>;   // charaId -> ISO date of first fast-forward
		skills: Record<string, string>; // skillId  -> ISO date
	};
}

function loadManifest(outputDir: string): Manifest {
	const p = path.join(outputDir, MANIFEST_FILE_NAME);
	if (fs.existsSync(p)) {
		try {
			const m = JSON.parse(fs.readFileSync(p, 'utf-8'));
			// Backfill schema if older
			m.history ||= [];
			m.firstSeen ||= { umas: {}, skills: {} };
			m.firstSeen.umas ||= {};
			m.firstSeen.skills ||= {};
			return m;
		} catch (e) {
			console.warn(`  [warn] manifest unreadable, starting fresh: ${(e as Error).message}`);
		}
	}
	return {
		description: 'Fast-forward audit log for umalator-global. history[] is append-only; firstSeen maps each entity ID to the ISO date of its first fast-forward.',
		lastRun: null,
		history: [],
		firstSeen: { umas: {}, skills: {} },
	};
}

function updateManifest(outputDir: string, entry: ManifestEntry) {
	const p = path.join(outputDir, MANIFEST_FILE_NAME);
	const manifest = loadManifest(outputDir);

	// No-op if nothing was added (avoid noise in the log)
	if (entry.addedUmaIds.length === 0 && entry.addedSkillIds.length === 0) {
		console.log(`  [manifest] no new entries — skipping log append`);
		return;
	}

	manifest.history.push(entry);
	manifest.lastRun = entry.timestamp;
	const dateOnly = entry.timestamp.slice(0, 10);
	for (const id of entry.addedUmaIds) {
		const k = String(id);
		if (!manifest.firstSeen.umas[k]) manifest.firstSeen.umas[k] = dateOnly;
	}
	for (const id of entry.addedSkillIds) {
		const k = String(id);
		if (!manifest.firstSeen.skills[k]) manifest.firstSeen.skills[k] = dateOnly;
	}

	fs.writeFileSync(p, JSON.stringify(manifest, null, 2), 'utf-8');
	console.log(`  [manifest] appended entry to ${MANIFEST_FILE_NAME} (history now ${manifest.history.length} entries)`);
}

// ============================================================================
// Cutoff Resolution (date-based modes)
// ============================================================================

interface CutoffResolution {
	date: string;             // YYYY-MM-DD (inclusive)
	source: string;            // Human-readable description
	eligibleUmaIds: Set<number>; // Set of charaIds whose debut release ≤ cutoff
}

function readJson(p: string): any {
	if (!fs.existsSync(p)) {
		throw new Error(`Reference file missing: ${p}. Run from repo root, or check docs/ generation.`);
	}
	return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/**
 * Walk jp-uma-releases.json and return the SET of charaIds whose debut outfit
 * (cardId ending in "01") was released on JP at or before the cutoff.
 *
 * IMPORTANT: charaIds are NOT chronological — Narita Top Road has charaId 1077
 * but released later than Wonder Acute (charaId 1100). A simple numeric cap
 * would over-include umas. Always use the set.
 */
function deriveEligibleUmaIds(cutoffDate: string): Set<number> {
	const data = readJson(REF_FILES.umaReleases);
	const umas: Array<{ cardId: number; charaId: number; startDate: string }> = data.umas || [];
	const eligible = new Set<number>();
	for (const u of umas) {
		if (u.startDate <= cutoffDate && String(u.cardId).endsWith('01')) {
			eligible.add(u.charaId);
		}
	}
	if (eligible.size === 0) {
		throw new Error(`No umas found released on or before ${cutoffDate} — bad cutoff?`);
	}
	return eligible;
}

function resolveByDate(date: string): CutoffResolution {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		throw new Error(`--through-date must be YYYY-MM-DD, got: ${date}`);
	}
	return {
		date,
		source: `--through-date ${date}`,
		eligibleUmaIds: deriveEligibleUmaIds(date),
	};
}

function resolveByScenario(name: string): CutoffResolution {
	const data = readJson(REF_FILES.scenarios);
	const scenarios: Array<{ enName: string; jpName: string; startDate: string; endDate: string | null }> = data.scenarios || [];
	const lower = name.toLowerCase();
	const match = scenarios.find(s =>
		s.enName.toLowerCase() === lower ||
		s.enName.toLowerCase().includes(lower)
	);
	if (!match) {
		const list = scenarios.map(s => `  - ${s.enName}`).join('\n');
		throw new Error(`Scenario "${name}" not found. Available:\n${list}`);
	}
	const cutoff = match.endDate || new Date().toISOString().slice(0, 10);
	return {
		date: cutoff,
		source: `--through-scenario "${match.enName}" (${match.startDate} → ${match.endDate || 'current'})`,
		eligibleUmaIds: deriveEligibleUmaIds(cutoff),
	};
}

function resolveByAnniversary(ord: string): CutoffResolution {
	const data = readJson(REF_FILES.anniversaries);
	const annivs: Array<{ ordinal: string; label: string; longLabel: string; date: string; isHalf: boolean; isLaunch: boolean }> = data.anniversaries || [];
	// Normalize: strip "th"/"st"/"nd"/"rd" suffixes, drop "anniversary", lowercase, trim.
	const norm = (s: string) => s.toLowerCase().trim()
		.replace(/\b(\d+(?:\.5)?)(st|nd|rd|th)\b/g, '$1')
		.replace(/\banniversary\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	const target = norm(ord);
	const match = annivs.find(a =>
		norm(a.ordinal) === target ||
		norm(a.label) === target ||
		norm(a.longLabel) === target
	);
	if (!match) {
		const list = annivs.map(a => `  - ${a.ordinal} (${a.longLabel}, ${a.date})`).join('\n');
		throw new Error(`Anniversary "${ord}" not found. Available:\n${list}\n  (accepts e.g. "4", "4th", "4 anniversary", "4.5", "0.5", "launch")`);
	}
	return {
		date: match.date,
		source: `--through-anniversary "${match.longLabel}" (${match.date})`,
		eligibleUmaIds: deriveEligibleUmaIds(match.date),
	};
}

function resolveByCm(cmId: number): CutoffResolution {
	const data = readJson(REF_FILES.championsMeetings);
	const cms: Array<{ id: number; name: string; startDate: string }> = data.champions_meetings || [];
	const match = cms.find(c => c.id === cmId);
	if (!match) {
		throw new Error(`Champions Meeting #${cmId} not found in docs/jp-champions-meetings.json`);
	}
	return {
		date: match.startDate,
		source: `--through-cm ${cmId} (${match.name}, ${match.startDate})`,
		eligibleUmaIds: deriveEligibleUmaIds(match.startDate),
	};
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArguments(): FastForwardConfig {
	program
		.name('fast-forward-global')
		.description('Generate Global data files with JP content. Supports date-based or numeric cutoffs.')
		.version('2.0.0')
		// Date-based cutoffs (preferred, mutually exclusive with --max-uma-id)
		.option('--through-date <YYYY-MM-DD>', 'Include JP content released on or before this date')
		.option('--through-scenario <name>', 'Include content from scenarios up to and including this one (e.g. "UAF")')
		.option('--through-anniversary <ord>', 'Include content released by this anniversary (e.g. "5th", "4.5th")')
		.option('--through-cm <id>', 'Include content released in time for Champions Meeting #N', parseInt)
		// Numeric cutoffs (legacy / explicit override)
		.option('--max-skill-id <number>', 'Maximum skill ID to include (default: include all new JP skills)', parseInt)
		.option('--max-uma-id <number>', 'Maximum uma ID to include (legacy; date modes derive this automatically)', parseInt)
		// I/O
		.option('--output-dir <path>', 'Output directory (default: umalator-global/)', DEFAULT_OUTPUT_DIR)
		.option('--backup', 'Create backups of existing files before overwriting')
		.option('--restore-backup', 'Restore files from backups')
		.option('--dry-run', 'Compute the merge but do not write — print summary only')
		.option('--strict-skill-dates', 'Exclude skills with no known JP release date (default: include them as evergreen). Only affects date-cutoff modes.')
		.addHelpText('after', `
Examples:
  # Date-based cutoffs (recommended)
  $ ts-node tools/fast-forward-global.ts --through-date 2024-12-31 --dry-run
  $ ts-node tools/fast-forward-global.ts --through-anniversary 4th --backup
  $ ts-node tools/fast-forward-global.ts --through-scenario UAF
  $ ts-node tools/fast-forward-global.ts --through-cm 24

  # Legacy numeric cutoffs
  $ ts-node tools/fast-forward-global.ts --max-skill-id 220000 --max-uma-id 1050

  # Restore
  $ ts-node tools/fast-forward-global.ts --restore-backup
		`)
		.parse(process.argv);

	const options = program.opts();
	const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;

	// Restore backup mode - skip validation
	if (options.restoreBackup) {
		return {
			maxSkillId: 0,
			maxUmaId: 0,
			eligibleUmaIds: null,
			outputDir,
			createBackup: false,
			restoreBackup: true,
			dryRun: false,
			cutoffDate: null,
			cutoffSource: null,
			strictSkillDates: false,
		};
	}

	// Resolve date-based cutoff (at most one of these)
	const dateCutoffFlags = [
		options.throughDate ? 'date' : null,
		options.throughScenario ? 'scenario' : null,
		options.throughAnniversary ? 'anniversary' : null,
		options.throughCm !== undefined ? 'cm' : null,
	].filter(Boolean) as string[];

	if (dateCutoffFlags.length > 1) {
		console.error(`Error: at most one of --through-date / --through-scenario / --through-anniversary / --through-cm may be specified.`);
		process.exit(1);
	}

	let resolution: CutoffResolution | null = null;
	try {
		if (options.throughDate) resolution = resolveByDate(options.throughDate);
		else if (options.throughScenario) resolution = resolveByScenario(options.throughScenario);
		else if (options.throughAnniversary) resolution = resolveByAnniversary(options.throughAnniversary);
		else if (options.throughCm !== undefined) resolution = resolveByCm(options.throughCm);
	} catch (e: any) {
		console.error(`Error resolving cutoff: ${e.message}`);
		process.exit(1);
	}

	let maxUmaId: number;
	let eligibleUmaIds: Set<number> | null = null;
	let cutoffDate: string | null = null;
	let cutoffSource: string | null = null;

	if (resolution) {
		// Date-based mode — set is authoritative; maxUmaId is only used as an additional explicit cap
		eligibleUmaIds = resolution.eligibleUmaIds;
		maxUmaId = options.maxUmaId || Math.max(...resolution.eligibleUmaIds);
		cutoffDate = resolution.date;
		cutoffSource = resolution.source;
	} else {
		// Legacy numeric mode — require --max-uma-id explicitly; no eligibility set
		if (!options.maxUmaId) {
			console.error('Error: provide a date-based cutoff (--through-*) or --max-uma-id.');
			process.exit(1);
		}
		maxUmaId = options.maxUmaId;
	}

	// Skill cap: explicit --max-skill-id, or default to "include all" (Number.MAX_SAFE_INTEGER)
	const maxSkillId = options.maxSkillId ?? Number.MAX_SAFE_INTEGER;

	if (maxUmaId <= 0) {
		console.error('Error: resolved max uma id must be a positive integer');
		process.exit(1);
	}
	if (options.maxSkillId !== undefined && options.maxSkillId <= 0) {
		console.error('Error: --max-skill-id must be a positive integer');
		process.exit(1);
	}

	return {
		maxSkillId,
		maxUmaId,
		eligibleUmaIds,
		outputDir,
		createBackup: !!options.backup,
		restoreBackup: false,
		dryRun: !!options.dryRun,
		cutoffDate,
		cutoffSource,
		strictSkillDates: !!options.strictSkillDates,
	};
}

// ============================================================================
// Skill release-date map (used to gate general skills by date in date mode)
// ============================================================================

let _skillDates: Map<number, string> | null = null;
function loadSkillReleaseDates(): Map<number, string> {
	if (_skillDates) return _skillDates;
	const p = REF_FILES.skillReleases;
	if (!fs.existsSync(p)) {
		console.warn(`  [warn] skill release dates file missing: ${p}. General-skill date gating disabled.`);
		_skillDates = new Map();
		return _skillDates;
	}
	try {
		const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
		const m = new Map<number, string>();
		for (const [sid, date] of Object.entries(data.earliestByJpDate || {})) {
			m.set(parseInt(sid), date as string);
		}
		_skillDates = m;
		return _skillDates;
	} catch (e: any) {
		console.warn(`  [warn] could not parse skill release dates: ${e.message}`);
		_skillDates = new Map();
		return _skillDates;
	}
}

/**
 * Skill inclusion gate. Returns true if the skill should be added.
 *
 * In date-cutoff mode:
 *   - Skill has a known release date: include iff date ≤ cutoff
 *   - Skill has no known release date:
 *       - Default (strict=false):  include (treat as evergreen, preserves current behavior)
 *       - --strict-skill-dates:    exclude (only release-dated skills make the cut)
 * In legacy mode (no cutoffDate): include all (numeric cap applied separately).
 *
 * The numeric cap (maxSkillId) is always applied in addition.
 */
function skillEligibleByDate(skillId: number, cutoffDate: string | null, skillDates: Map<number, string>, strict: boolean): boolean {
	if (!cutoffDate) return true;
	const rd = skillDates.get(skillId);
	if (!rd) return !strict;     // undated → strict excludes, lenient includes
	return rd <= cutoffDate;
}

// ============================================================================
// Backup/Restore Logic
// ============================================================================

async function backupFiles(outputDir: string): Promise<void> {
	console.log('\nCreating backups...');

	for (const fileName of Object.values(DATA_FILES)) {
		const filePath = path.join(outputDir, fileName);
		const backupPath = `${filePath}.bak`;

		if (fs.existsSync(filePath)) {
			fs.copyFileSync(filePath, backupPath);
			console.log(`  ✓ Backed up ${fileName} → ${fileName}.bak`);
		} else {
			console.log(`  ⊘ Skipped ${fileName} (file doesn't exist)`);
		}
	}
}

async function restoreBackup(outputDir: string): Promise<void> {
	console.log('\nRestoring from backups...');

	let restoredCount = 0;

	for (const fileName of Object.values(DATA_FILES)) {
		const filePath = path.join(outputDir, fileName);
		const backupPath = `${filePath}.bak`;

		if (fs.existsSync(backupPath)) {
			fs.copyFileSync(backupPath, filePath);
			fs.unlinkSync(backupPath);
			console.log(`  ✓ Restored ${fileName} from backup`);
			restoredCount++;
		} else {
			console.log(`  ⊘ No backup found for ${fileName}`);
		}
	}

	console.log(`\n✓ Restore complete! Restored ${restoredCount} file(s).`);
}

// ============================================================================
// Data Processing Functions
// ============================================================================

function processSkillData(maxSkillId: number, outputDir: string, newUmaIds: number[], cutoffDate: string | null, strictSkillDates: boolean): { data: Record<string, any>; added: number[]; gatedByDate: number } {
	const jpSkillDataPath = path.join(JP_DATA_DIR, DATA_FILES.skillData);
	const jpData = JSON.parse(fs.readFileSync(jpSkillDataPath, 'utf-8'));

	// Read existing Global data to preserve it
	const globalPath = path.join(outputDir, DATA_FILES.skillData);
	let globalData: Record<string, any> = {};
	let existingIds = new Set<number>();

	if (fs.existsSync(globalPath)) {
		globalData = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
		existingIds = new Set(Object.keys(globalData).map(id => parseInt(id)));
		console.log(`  Preserving ${existingIds.size} existing entries in skill_data.json`);
	}

	const merged: Record<string, any> = { ...globalData };

	// Build skill patterns for newly added umas (uma 1068 -> "10068" / "90068")
	const umaSkillPatterns = newUmaIds.map(umaId => {
		const umaDigits = umaId.toString().substring(1);
		return { unique: `10${umaDigits}`, inherited: `90${umaDigits}` };
	});

	const skillDates = loadSkillReleaseDates();
	const added: number[] = [];
	let addedCount = 0;
	let addedUmaSkillCount = 0;
	let gatedByDate = 0;

	for (const [id, data] of Object.entries(jpData)) {
		const numericId = parseInt(id);

		const isUmaSkill = umaSkillPatterns.some(pattern =>
			id.startsWith(pattern.unique) || id.startsWith(pattern.inherited)
		);

		if (isUmaSkill) {
			merged[id] = data;
			if (!existingIds.has(numericId)) {
				addedUmaSkillCount++;
				added.push(numericId);
			}
		} else if (!existingIds.has(numericId) && numericId <= maxSkillId) {
			if (!skillEligibleByDate(numericId, cutoffDate, skillDates, strictSkillDates)) {
				gatedByDate++;
				continue;
			}
			merged[id] = data;
			addedCount++;
			added.push(numericId);
		}
	}

	console.log(`  Added ${addedCount} new skills from JP data` + (gatedByDate ? ` (${gatedByDate} gated by cutoff date)` : ''));
	if (addedUmaSkillCount > 0) {
		console.log(`  Added ${addedUmaSkillCount} character-specific skills for new umas`);
	}

	return { data: merged, added, gatedByDate };
}

function processSkillNames(maxSkillId: number, outputDir: string, newUmaIds: number[], cutoffDate: string | null, strictSkillDates: boolean): { data: Record<string, string[]>; added: number[]; gatedByDate: number } {
	const jpSkillNamesPath = path.join(JP_DATA_DIR, DATA_FILES.skillNames);
	const jpData: Record<string, [string, string]> = JSON.parse(fs.readFileSync(jpSkillNamesPath, 'utf-8'));

	// Read existing Global data to preserve it
	const globalPath = path.join(outputDir, DATA_FILES.skillNames);
	let globalData: Record<string, string[]> = {};
	let existingIds = new Set<number>();

	if (fs.existsSync(globalPath)) {
		globalData = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
		existingIds = new Set(Object.keys(globalData).map(id => parseInt(id)));
		console.log(`  Preserving ${existingIds.size} existing entries in skillnames.json`);
	}

	const merged: Record<string, string[]> = { ...globalData };
	const baseSkillNames: Map<string, string> = new Map();
	const skillDates = loadSkillReleaseDates();
	const added: number[] = [];
	let gatedByDate = 0;

	// Build skill patterns for newly added umas
	const umaSkillPatterns = newUmaIds.map(umaId => {
		const umaDigits = umaId.toString().substring(1);
		return {
			unique: `10${umaDigits}`,
			inherited: `90${umaDigits}`
		};
	});

	// First pass: collect all base skill names (1xxx IDs)
	for (const [id, [japanese, english]] of Object.entries(jpData)) {
		const numericId = parseInt(id);
		if (numericId <= maxSkillId && id[0] === '1' && english) {
			baseSkillNames.set(id, english);
		}
	}

	// Second pass: process all NEW skills (IDs higher than existing Global) + uma-specific skills
	let addedCount = 0;
	let addedUmaSkillCount = 0;

	for (const [id, [japanese, english]] of Object.entries(jpData)) {
		const numericId = parseInt(id);

		// Check if this is a character-specific skill for a newly added uma
		const isUmaSkill = umaSkillPatterns.some(pattern =>
			id.startsWith(pattern.unique) || id.startsWith(pattern.inherited)
		);

		// Process uma-specific skills (overwrite existing Global translations with JP)
		if (isUmaSkill) {
			const wasExisting = existingIds.has(numericId);
			if (id[0] === '9' && !english) {
				const baseId = '1' + id.substring(1);
				const baseName = baseSkillNames.get(baseId);
				if (baseName) {
					merged[id] = [`${baseName}`];
					if (!wasExisting) { addedUmaSkillCount++; added.push(numericId); }
				} else if (japanese) {
					merged[id] = [`[JP] ${japanese}`];
					if (!wasExisting) { addedUmaSkillCount++; added.push(numericId); }
				}
			} else if (english) {
				merged[id] = [english];
				if (!wasExisting) { addedUmaSkillCount++; added.push(numericId); }
			} else if (japanese) {
				merged[id] = [`[JP] ${japanese}`];
				if (!wasExisting) { addedUmaSkillCount++; added.push(numericId); }
			}
		}
		// Process general new skills (set-based, not max-id-based)
		else if (!existingIds.has(numericId) && numericId <= maxSkillId) {
			if (!skillEligibleByDate(numericId, cutoffDate, skillDates, strictSkillDates)) {
				gatedByDate++;
				continue;
			}
			if (id[0] === '9' && !english) {
				const baseId = '1' + id.substring(1);
				const baseName = baseSkillNames.get(baseId);
				if (baseName) {
					merged[id] = [`${baseName}`];
					addedCount++; added.push(numericId);
				} else {
					merged[id] = [`[JP] ${japanese}`];
					addedCount++; added.push(numericId);
				}
			} else if (english) {
				merged[id] = [english];
				addedCount++; added.push(numericId);
			} else if (japanese) {
				merged[id] = [`[JP] ${japanese}`];
				addedCount++; added.push(numericId);
			}
		}
	}

	console.log(`  Added ${addedCount} new skill names from JP data` + (gatedByDate ? ` (${gatedByDate} gated by cutoff date)` : ''));
	if (addedUmaSkillCount > 0) {
		console.log(`  Added ${addedUmaSkillCount} character-specific skill names for new umas`);
	}

	return { data: merged, added, gatedByDate };
}

function processSkillMeta(maxSkillId: number, outputDir: string, newUmaIds: number[], cutoffDate: string | null, strictSkillDates: boolean): { data: Record<string, any>; added: number[]; gatedByDate: number } {
	const jpSkillMetaPath = path.join(PROJECT_ROOT, DATA_FILES.skillMeta);
	const jpData = JSON.parse(fs.readFileSync(jpSkillMetaPath, 'utf-8'));

	const globalPath = path.join(outputDir, DATA_FILES.skillMeta);
	let globalData: Record<string, any> = {};
	let existingIds = new Set<number>();

	if (fs.existsSync(globalPath)) {
		globalData = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
		existingIds = new Set(Object.keys(globalData).map(id => parseInt(id)));
		console.log(`  Preserving ${existingIds.size} existing entries in skill_meta.json`);
	}

	const merged: Record<string, any> = { ...globalData };

	const umaSkillPatterns = newUmaIds.map(umaId => {
		const umaDigits = umaId.toString().substring(1);
		return { unique: `10${umaDigits}`, inherited: `90${umaDigits}` };
	});

	const skillDates = loadSkillReleaseDates();
	const added: number[] = [];
	let addedCount = 0;
	let addedUmaSkillCount = 0;
	let gatedByDate = 0;

	for (const [id, data] of Object.entries(jpData)) {
		const numericId = parseInt(id);

		const isUmaSkill = umaSkillPatterns.some(pattern =>
			id.startsWith(pattern.unique) || id.startsWith(pattern.inherited)
		);

		if (isUmaSkill) {
			merged[id] = data;
			if (!existingIds.has(numericId)) { addedUmaSkillCount++; added.push(numericId); }
		} else if (!existingIds.has(numericId) && numericId <= maxSkillId) {
			if (!skillEligibleByDate(numericId, cutoffDate, skillDates, strictSkillDates)) {
				gatedByDate++;
				continue;
			}
			merged[id] = data;
			addedCount++;
			added.push(numericId);
		}
	}

	console.log(`  Added ${addedCount} new skill metadata from JP data` + (gatedByDate ? ` (${gatedByDate} gated by cutoff date)` : ''));
	if (addedUmaSkillCount > 0) {
		console.log(`  Added ${addedUmaSkillCount} character-specific skill metadata for new umas`);
	}

	return { data: merged, added, gatedByDate };
}

function processUmas(
	maxUmaId: number,
	outputDir: string,
	eligibleUmaIds: Set<number> | null
): { data: Record<string, any>; added: number[] } {
	const jpUmasPath = path.join(PROJECT_ROOT, DATA_FILES.umas);
	const jpData = JSON.parse(fs.readFileSync(jpUmasPath, 'utf-8'));

	const globalPath = path.join(outputDir, DATA_FILES.umas);
	let globalData: Record<string, any> = {};
	let existingIds = new Set<number>();

	if (fs.existsSync(globalPath)) {
		globalData = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
		existingIds = new Set(Object.keys(globalData).map(id => parseInt(id)));
		console.log(`  Preserving ${existingIds.size} existing entries in umas.json`);
	}

	const merged: Record<string, any> = { ...globalData };
	const added: number[] = [];

	// Inclusion test: in date mode, set is authoritative (handles non-chronological charaIds);
	// in legacy mode, fall back to numeric cap only.
	const isEligible = (numericId: number): boolean => {
		if (eligibleUmaIds) return eligibleUmaIds.has(numericId);
		return numericId <= maxUmaId;
	};

	// Track date-eligible JP umas that are NOT in our JP source data — surfaces missing entries.
	const missingFromJpSource: number[] = [];
	if (eligibleUmaIds) {
		for (const id of eligibleUmaIds) {
			if (!jpData[String(id)]) missingFromJpSource.push(id);
		}
	}

	for (const [id, data] of Object.entries(jpData)) {
		const numericId = parseInt(id);
		if (existingIds.has(numericId)) continue;        // already in JSON
		if (!isEligible(numericId)) continue;            // beyond cutoff / not in eligible set

		// Debut outfit only (id ending in "01")
		const allOutfits = (data as any).outfits;
		const firstOutfit: Record<string, any> = {};
		for (const [outfitId, outfitData] of Object.entries(allOutfits)) {
			if (outfitId.endsWith('01')) {
				firstOutfit[outfitId] = outfitData;
				break;
			}
		}

		merged[id] = {
			name: ["", (data as any).name[1]],
			outfits: firstOutfit
		};
		added.push(numericId);
	}

	console.log(`  Added ${added.length} new umas from JP data`);
	if (missingFromJpSource.length > 0) {
		console.log(`  [warn] ${missingFromJpSource.length} eligible chara id(s) not present in JP umas.json source: ${missingFromJpSource.join(', ')}`);
	}

	return { data: merged, added };
}

// ============================================================================
// Write Output Files
// ============================================================================

async function writeOutputFiles(
	outputDir: string,
	data: {
		skillData: Record<string, any>;
		skillNames: Record<string, string[]>;
		skillMeta: Record<string, any>;
		umaData: Record<string, any>;
	},
	dryRun: boolean
): Promise<void> {
	if (dryRun) {
		console.log('\n[dry-run] Skipping file writes. Sizes that would be written:');
	} else {
		console.log('\nWriting output files...');
	}

	if (!dryRun && !fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	const files = [
		{ name: DATA_FILES.skillData, data: data.skillData },
		{ name: DATA_FILES.skillNames, data: data.skillNames },
		{ name: DATA_FILES.skillMeta, data: data.skillMeta },
		{ name: DATA_FILES.umas, data: data.umaData }
	];

	for (const file of files) {
		const filePath = path.join(outputDir, file.name);
		const jsonContent = JSON.stringify(file.data, null, 2);
		const sizeKB = (Buffer.byteLength(jsonContent, 'utf-8') / 1024).toFixed(1);
		if (dryRun) {
			console.log(`  ⊘ Would write ${file.name} (${sizeKB} KB)`);
		} else {
			fs.writeFileSync(filePath, jsonContent, 'utf-8');
			console.log(`  ✓ Wrote ${file.name} (${sizeKB} KB)`);
		}
	}
}

// ============================================================================
// Main Execution Flow
// ============================================================================

async function main() {
	console.log('Fast Forward Global Data Tool');
	console.log('==============================\n');

	// 1. Parse CLI arguments
	const config = parseArguments();

	// 2. Handle restore-backup mode
	if (config.restoreBackup) {
		await restoreBackup(config.outputDir);
		return;
	}

	// 3. Print plan
	console.log('Plan:');
	if (config.cutoffSource) {
		console.log(`  Cutoff: ${config.cutoffDate}  (resolved from ${config.cutoffSource})`);
	}
	if (config.eligibleUmaIds) {
		console.log(`  Eligible JP umas (by release date): ${config.eligibleUmaIds.size}`);
	} else {
		console.log(`  Max uma ID: ${config.maxUmaId}`);
	}
	console.log(`  Max skill ID: ${config.maxSkillId === Number.MAX_SAFE_INTEGER ? 'no cap (all new JP skills)' : config.maxSkillId}`);
	if (config.cutoffDate) {
		console.log(`  Skill date gating: ${config.strictSkillDates ? 'STRICT (undated skills excluded)' : 'lenient (undated skills included as evergreen)'}`);
	}
	console.log(`  Mode: ${config.dryRun ? 'DRY-RUN (no files will be written)' : 'WRITE'}`);
	if (config.createBackup && !config.dryRun) console.log(`  Backups: enabled (.bak files)`);

	// 4. Create backups if requested (skip in dry-run)
	if (config.createBackup && !config.dryRun) {
		await backupFiles(config.outputDir);
	}

	// 5. Process data
	console.log(`\nProcessing (merge mode: preserve existing Global, add new JP)...`);

	const umaResult = processUmas(config.maxUmaId, config.outputDir, config.eligibleUmaIds);
	const newlyAddedUmaIds = umaResult.added;

	if (newlyAddedUmaIds.length > 0) {
		console.log(`  Including character-specific skills for ${newlyAddedUmaIds.length} new uma(s): ${newlyAddedUmaIds.join(', ')}`);
		if (config.cutoffDate) {
			try {
				const refData = readJson(REF_FILES.umaReleases);
				const refByChara = new Map<number, string>();
				for (const u of (refData.umas as any[]) || []) {
					if (u.charaId && u.nameEn) refByChara.set(u.charaId, u.nameEn);
				}
				const named = newlyAddedUmaIds.map(id => `${id} (${refByChara.get(id) || '?'})`);
				console.log(`    Names: ${named.join(', ')}`);
			} catch {
				/* ref file optional */
			}
		}
	}

	const skillDataResult = processSkillData(config.maxSkillId, config.outputDir, newlyAddedUmaIds, config.cutoffDate, config.strictSkillDates);
	const skillNamesResult = processSkillNames(config.maxSkillId, config.outputDir, newlyAddedUmaIds, config.cutoffDate, config.strictSkillDates);
	const skillMetaResult = processSkillMeta(config.maxSkillId, config.outputDir, newlyAddedUmaIds, config.cutoffDate, config.strictSkillDates);

	// Cross-check against master.mdb (informational): which JSON entries are NOT yet on Global?
	const mdbDelta = diffJsonAgainstMasterMdb({
		jsonUmas: umaResult.data,
		jsonSkills: skillDataResult.data,
	});
	if (mdbDelta) {
		const { umasNotOnGlobal, skillsNotOnGlobal } = mdbDelta;
		if (umasNotOnGlobal.length > 0 || skillsNotOnGlobal.length > 0) {
			console.log(`\n[master.mdb cross-check]`);
			console.log(`  ${umasNotOnGlobal.length} uma(s) in JSON but not yet on Global game (previously fast-forwarded)`);
			console.log(`  ${skillsNotOnGlobal.length} skill(s) in JSON but not yet on Global game (previously fast-forwarded)`);
		}
	}

	// 6. Write output files (or skip if dry-run)
	await writeOutputFiles(
		config.outputDir,
		{ skillData: skillDataResult.data, skillNames: skillNamesResult.data, skillMeta: skillMetaResult.data, umaData: umaResult.data },
		config.dryRun
	);

	// 7. Update fast-forward manifest (skip in dry-run)
	if (!config.dryRun) {
		const allAddedSkillIds = uniqueSorted([
			...skillDataResult.added,
			...skillNamesResult.added,
			...skillMetaResult.added,
		]);
		updateManifest(config.outputDir, {
			timestamp: new Date().toISOString(),
			cutoffSource: config.cutoffSource,
			cutoffDate: config.cutoffDate,
			maxUmaId: config.maxUmaId,
			maxSkillId: config.maxSkillId === Number.MAX_SAFE_INTEGER ? null : config.maxSkillId,
			addedUmaIds: newlyAddedUmaIds,
			addedSkillIds: allAddedSkillIds,
			counts: {
				umas: newlyAddedUmaIds.length,
				skills: allAddedSkillIds.length,
			},
		});
	}

	// 8. Print summary
	console.log(`\n${config.dryRun ? '[dry-run]' : '✓'} ${config.dryRun ? 'Plan summary:' : 'Fast-forward complete!'}`);
	console.log(`  Skills:      ${Object.keys(skillDataResult.data).length}`);
	console.log(`  Skill names: ${Object.keys(skillNamesResult.data).length}`);
	console.log(`  Umas:        ${Object.keys(umaResult.data).length}  (+${newlyAddedUmaIds.length} new)`);
	console.log(`  Output dir:  ${config.outputDir}`);
	if (config.dryRun) {
		console.log(`\n  Re-run without --dry-run to apply.`);
	}
	console.log();
}

function uniqueSorted(arr: number[]): number[] {
	return Array.from(new Set(arr)).sort((a, b) => a - b);
}

// Run the tool
main().catch(err => {
	console.error('\n✗ Error:', err.message);
	process.exit(1);
});
