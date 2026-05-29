# Mechanics Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/mechanics-explorer` sub-app that lets a user configure an uma + course and see how each stat feeds the race-mechanics formulas, via a live readout and a stat-sweep chart.

**Architecture:** New esbuild sub-app under `umalator-global/mechanics-explorer/`, mirroring the `skill-visualizer` pattern. It reuses v2 components (`V2UmaPanel`, `V2TrackSelect`, `SegmentedControl`, `CollapsibleSection`) and the canonical stat-adjustment pipeline (`buildBaseStats` + `buildAdjustedStats` from `RaceSolverBuilder.ts`). A pure, unit-tested `mechanics.ts` module holds the transcribed formulas. A local D3 `SweepChart` plots one mechanic vs one swept stat.

**Tech Stack:** Preact (`h` pragma), esbuild, D3, TypeScript, tape (for the pure-formula unit tests).

---

## File Structure

| Path | Responsibility |
|---|---|
| `umalator-global/mechanics-explorer/index.html` | Entry HTML, `#app` mount, links `bundle.css`/`bundle.js` |
| `umalator-global/mechanics-explorer/build.mjs` | esbuild build (`redirectData` + `mockAssert` plugins, `CC_GLOBAL`), `--debug` + `--serve [port]` |
| `umalator-global/mechanics-explorer/mechanics.ts` | Pure transcribed formula module (no UI, no node deps) |
| `umalator-global/mechanics-explorer/mechanics.test.ts` | tape unit tests for `mechanics.ts` |
| `umalator-global/mechanics-explorer/app.tsx` | Main app: state (uma/course/ground), HorseParameters wiring, layout |
| `umalator-global/mechanics-explorer/mechanics-readout.tsx` | The four live-value readout cards |
| `umalator-global/mechanics-explorer/sweep-chart.tsx` | Local D3 line-chart component |
| `umalator-global/mechanics-explorer/mechanics-explorer.css` | App-specific styles (reuses v2 tokens) |
| `_redirects` | Add `/mechanics-explorer/*` rewrite rule |
| `build-all.sh` | Add mechanics-explorer build step |
| `CLAUDE.md` | Add app-table row |

**Testing note:** This repo has no frontend component-test harness. Per "follow existing patterns," only the pure `mechanics.ts` module is unit-tested (tape, like `uma-skill-tools`). UI tasks are verified by building and visually checking the dev server — each such task lists the exact command and what to observe.

---

## Task 1: Scaffold the sub-app skeleton

**Files:**
- Create: `umalator-global/mechanics-explorer/index.html`
- Create: `umalator-global/mechanics-explorer/mechanics-explorer.css`
- Create: `umalator-global/mechanics-explorer/app.tsx`
- Create: `umalator-global/mechanics-explorer/build.mjs`

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>

<html>
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link rel="icon" type="image/svg+xml" href="../../favicon.svg">
		<title>Mechanics Explorer</title>
		<link rel="stylesheet" href="bundle.css">
	</head>
	<body>
		<div id="app"></div>
		<script src="bundle.js"></script>
	</body>
</html>
```

- [ ] **Step 2: Create `mechanics-explorer.css`** (minimal stub; expanded in later tasks)

```css
/* Mechanics Explorer — app-specific styles. Reuses v2.css design tokens. */
.mx-app {
	max-width: 1200px;
	margin: 0 auto;
	padding: var(--space-4, 16px);
}
.mx-header h1 {
	font-size: 1.5rem;
	margin: 0 0 var(--space-3, 12px);
}
.mx-layout {
	display: grid;
	grid-template-columns: minmax(280px, 360px) 1fr;
	gap: var(--space-4, 16px);
	align-items: start;
}
@media (max-width: 800px) {
	.mx-layout { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: Create a minimal `app.tsx`** (renders a heading; full wiring in Task 5)

```tsx
/**
 * Mechanics Explorer
 * Shows how uma stats feed the underlying race-mechanics formulas.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render } from 'preact';

import '../v2/v2.css';
import './mechanics-explorer.css';

function App() {
	return (
		<div class="mx-app">
			<div class="mx-header"><h1>Mechanics Explorer</h1></div>
		</div>
	);
}

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 4: Create `build.mjs`**

```js
import * as esbuild from 'esbuild';
import * as path from 'node:path';
import * as http from 'node:http';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { program } from 'commander';

program
	.option('--debug')
	.option('--serve [port]');

program.parse();
const options = program.opts();
const debug = !!options.debug;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const globalDir = path.join(dirname, '..');   // umalator-global
const rootDir = path.join(globalDir, '..');   // repo root

// Alias uma-skill-tools/data/* imports (and skill_meta/umas) to the Global data files.
const redirectData = {
	name: 'redirectData',
	setup(build) {
		build.onResolve({filter: /^(?:\.\.\/)*(?:uma-skill-tools\/)?data\//}, args => ({
			path: path.join(globalDir, args.path.split('/data/')[1])
		}));
		build.onResolve({filter: /skill_meta.json$/}, () => ({
			path: path.join(globalDir, 'skill_meta.json')
		}));
		build.onResolve({filter: /umas.json$/}, () => ({
			path: path.join(globalDir, 'umas.json')
		}));
	}
};

const mockAssertFn = debug ? 'console.assert' : 'function(){}';
const mockAssert = {
	name: 'mockAssert',
	setup(build) {
		build.onResolve({filter: /^node:assert$/}, args => ({
			path: args.path, namespace: 'mockAssert-ns'
		}));
		build.onLoad({filter: /.*/, namespace: 'mockAssert-ns'}, () => ({
			contents: 'module.exports={strict:'+mockAssertFn+'};',
			loader: 'js'
		}));
	}
};

const buildOptions = {
	entryPoints: [{in: './app.tsx', out: 'bundle'}],
	bundle: true,
	minify: !debug,
	outdir: '.',
	define: {CC_DEBUG: debug.toString(), CC_GLOBAL: 'true', CC_DEV: 'false'},
	alias: {'react': 'preact/compat', 'react-dom': 'preact/compat'},
	external: ['*.ttf'],
	plugins: [redirectData, mockAssert]
};

if (options.serve) {
	const port = typeof options.serve === 'string' ? +options.serve : 8000;
	const ctx = await esbuild.context(buildOptions);
	await ctx.watch();

	const mime = {
		'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
		'.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
		'.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp',
		'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
	};

	http.createServer((req, res) => {
		let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
		// Production _redirects rewrites /uma-tools/* to the repo root.
		if (urlPath.startsWith('/uma-tools/')) urlPath = urlPath.slice('/uma-tools'.length);
		// Serve this app at /mechanics-explorer/.
		if (urlPath === '/' || urlPath === '/mechanics-explorer' || urlPath === '/mechanics-explorer/') {
			urlPath = '/umalator-global/mechanics-explorer/index.html';
		} else if (urlPath.startsWith('/mechanics-explorer/')) {
			urlPath = '/umalator-global/mechanics-explorer/' + urlPath.slice('/mechanics-explorer/'.length);
		}
		const filePath = path.join(rootDir, urlPath);
		fs.readFile(filePath, (err, data) => {
			if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
			res.writeHead(200, {'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream'});
			res.end(data);
		});
	}).listen(port, () => {
		console.log(`Mechanics Explorer dev server: http://localhost:${port}/mechanics-explorer/`);
	});
} else {
	await esbuild.build(buildOptions);
	console.log('Built mechanics-explorer');
}
```

- [ ] **Step 5: Build it (debug) to verify the toolchain**

Run: `cd umalator-global/mechanics-explorer && node build.mjs --debug`
Expected: prints `Built mechanics-explorer`, creates `bundle.js` and `bundle.css`, no errors.

- [ ] **Step 6: Verify it serves**

Run (background): `cd umalator-global/mechanics-explorer && node build.mjs --serve 3100`
Then: `curl -sI http://localhost:3100/mechanics-explorer/ | head -1`
Expected: `HTTP/1.1 200 OK`. Also `curl -s http://localhost:3100/mechanics-explorer/bundle.js | head -c 40` returns JS, not a 404.
Then stop the server (kill the background process / free port 3100).

- [ ] **Step 7: Commit**

```bash
git add umalator-global/mechanics-explorer/index.html \
        umalator-global/mechanics-explorer/mechanics-explorer.css \
        umalator-global/mechanics-explorer/app.tsx \
        umalator-global/mechanics-explorer/build.mjs
git commit -m "Scaffold mechanics-explorer sub-app"
```

---

## Task 2: `mechanics.ts` — Speed & Accel formulas (TDD)

**Files:**
- Create: `umalator-global/mechanics-explorer/mechanics.ts`
- Create: `umalator-global/mechanics-explorer/mechanics.test.ts`

The module is pure: it operates on an already-**adjusted** horse (numeric strategy/aptitude, as on `HorseParameters`) and a minimal course. It imports nothing (avoids const-enum / node coupling). Coefficient tables are transcribed verbatim from `uma-skill-tools/RaceSolver.ts:21-72` and verified against the Race Mechanics doc §Speed/§Acceleration.

- [ ] **Step 1: Write the failing test** (`mechanics.test.ts`)

```ts
import test from 'tape';
import * as M from './mechanics';

// Synthetic adjusted horse: strategy=Senkou(2), distApt=S(0), surfApt=A(1).
const HORSE: M.MechHorse = {
	speed: 2000, stamina: 2000, power: 2000, guts: 2000, wisdom: 2000,
	strategy: 2, distanceAptitude: 0, surfaceAptitude: 1
};
const COURSE: M.MechCourse = { distance: 2000, surface: 1 }; // turf

function close(t, actual, expected, eps = 1e-6, msg = '') {
	t.ok(Math.abs(actual - expected) < eps, `${msg} (got ${actual}, want ~${expected})`);
}

test('baseSpeed', t => {
	t.equal(M.baseSpeed(2000), 20);
	t.equal(M.baseSpeed(3000), 19);
	t.equal(M.baseSpeed(1600), 20.4);
	t.end();
});

test('baseTargetSpeed per phase', t => {
	close(t, M.baseTargetSpeed(HORSE, COURSE, 0), 19.56, 1e-9, 'phase 0');
	close(t, M.baseTargetSpeed(HORSE, COURSE, 1), 19.82, 1e-9, 'phase 1');
	// phase 2: 20*0.975 + sqrt(500*2000)*1.05*0.002 = 19.5 + 2.1
	close(t, M.baseTargetSpeed(HORSE, COURSE, 2), 21.6, 1e-9, 'phase 2');
	t.end();
});

test('lastSpurtSpeed', t => {
	// (21.6 + 0.2)*1.05 + 2.1 + 450*2000^0.597*0.0001
	close(t, M.lastSpurtSpeed(HORSE, COURSE), 25.34773, 1e-4);
	t.end();
});

test('minSpeed', t => {
	// 0.85*20 + sqrt(200*2000)*0.001
	close(t, M.minSpeed(HORSE, COURSE), 17.6324555, 1e-6);
	t.end();
});

test('startingSpeed', t => {
	t.equal(M.startingSpeed(COURSE), 17);
	t.end();
});

test('baseAccel phase 2 flat', t => {
	// 0.0006 * sqrt(500*2000) * 0.996 * 1.0 * 1.0
	close(t, M.baseAccel(HORSE, 2, false), 0.5976, 1e-9);
	t.end();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`
Expected: FAIL — `Cannot find module './mechanics'` (or compile error), tests not passing.

- [ ] **Step 3: Write the minimal implementation** (`mechanics.ts`)

```ts
/**
 * Mechanics Explorer — pure race-mechanics formulas.
 *
 * Transcribed from docs/"Uma Musume Race Mechanics.md" (§Speed, §Acceleration,
 * §HP, §Last Spurt, §Skill Activation Chance) and verified line-by-line against
 * uma-skill-tools/RaceSolver.ts and HpPolicy.ts (the doc and code agree).
 *
 * All functions take an already-ADJUSTED horse (post motivation / course /
 * ground / strategy-proficiency) — the same HorseParameters the solver uses.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

/** Already-adjusted stats; strategy 1=Nige 2=Senkou 3=Sasi 4=Oikomi 5=Oonige; aptitude 0=S..7=G. */
export interface MechHorse {
	speed: number;
	stamina: number;
	power: number;
	guts: number;
	wisdom: number;
	strategy: number;
	distanceAptitude: number;
	surfaceAptitude: number;
}

/** Minimal course: surface 1=turf 2=dirt. */
export interface MechCourse {
	distance: number;
	surface: number;
}

// --- Speed (RaceSolver.ts:21-49; doc §Speed) ---
const SpeedStrategyPhaseCoefficient = [
	[],
	[1.0, 0.98, 0.962],
	[0.978, 0.991, 0.975],
	[0.938, 0.998, 0.994],
	[0.931, 1.0, 1.0],
	[1.063, 0.962, 0.95]
];
const SpeedDistanceProficiencyModifier = [1.05, 1.0, 0.9, 0.8, 0.6, 0.4, 0.2, 0.1];

// --- Acceleration (RaceSolver.ts:51-72; doc §Acceleration) ---
const AccelStrategyPhaseCoefficient = [
	[],
	[1.0, 1.0, 0.996],
	[0.985, 1.0, 0.996],
	[0.975, 1.0, 1.0],
	[0.945, 1.0, 0.997],
	[1.17, 0.94, 0.956]
];
const AccelGroundTypeProficiencyModifier = [1.05, 1.0, 0.9, 0.8, 0.7, 0.5, 0.3, 0.1];
const AccelDistanceProficiencyModifier = [1.0, 1.0, 1.0, 1.0, 1.0, 0.6, 0.5, 0.4];
const BaseAccel = 0.0006;
const UphillBaseAccel = 0.0004;

export function baseSpeed(distance: number): number {
	return 20.0 - (distance - 2000) / 1000.0;
}

export function baseTargetSpeed(h: MechHorse, c: MechCourse, phase: number): number {
	return baseSpeed(c.distance) * SpeedStrategyPhaseCoefficient[h.strategy][phase] +
		(phase === 2 ? Math.sqrt(500.0 * h.speed) * SpeedDistanceProficiencyModifier[h.distanceAptitude] * 0.002 : 0);
}

export function lastSpurtSpeed(h: MechHorse, c: MechCourse): number {
	let v = (baseTargetSpeed(h, c, 2) + 0.01 * baseSpeed(c.distance)) * 1.05 +
		Math.sqrt(500.0 * h.speed) * SpeedDistanceProficiencyModifier[h.distanceAptitude] * 0.002;
	v += Math.pow(450.0 * h.guts, 0.597) * 0.0001;
	return v;
}

export function minSpeed(h: MechHorse, c: MechCourse): number {
	return 0.85 * baseSpeed(c.distance) + Math.sqrt(200.0 * h.guts) * 0.001;
}

export function startingSpeed(c: MechCourse): number {
	return 0.85 * baseSpeed(c.distance);
}

export function baseAccel(h: MechHorse, phase: number, uphill = false): number {
	return (uphill ? UphillBaseAccel : BaseAccel) * Math.sqrt(500.0 * h.power) *
		AccelStrategyPhaseCoefficient[h.strategy][phase] *
		AccelGroundTypeProficiencyModifier[h.surfaceAptitude] *
		AccelDistanceProficiencyModifier[h.distanceAptitude];
}

/** Flat acceleration bonus applied during the start dash (RaceSolver.ts:532). */
export const StartDashAccel = 24.0;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`
Expected: TAP output, all assertions pass (`# ok`).

- [ ] **Step 5: Commit**

```bash
git add umalator-global/mechanics-explorer/mechanics.ts \
        umalator-global/mechanics-explorer/mechanics.test.ts
git commit -m "Add mechanics.ts speed & accel formulas with tests"
```

---

## Task 3: `mechanics.ts` — HP & Stamina formulas (TDD)

**Files:**
- Modify: `umalator-global/mechanics-explorer/mechanics.ts`
- Modify: `umalator-global/mechanics-explorer/mechanics.test.ts`

Transcribed from `uma-skill-tools/HpPolicy.ts:27-94` (doc §HP). Ground is a plain number (`1=Good/Firm, 2=Yielding/Good, 3=Soft, 4=Heavy`) to avoid importing the `GroundCondition` const enum.

- [ ] **Step 1: Add the failing tests** (append to `mechanics.test.ts`)

```ts
test('maxHp', t => {
	// 0.8 * HpStrategyCoefficient[2]=0.89 * 2000 + 2000
	t.equal(M.maxHp(HORSE, COURSE), 3424);
	t.end();
});

test('gutsModifier', t => {
	// 1 + 200/sqrt(600*2000)
	close(t, M.gutsModifier(HORSE), 1.1825742, 1e-6);
	t.end();
});

test('groundModifier turf Firm', t => {
	t.equal(M.groundModifier(COURSE, 1), 1.0);
	t.equal(M.groundModifier(COURSE, 3), 1.02); // turf Soft
	t.end();
});

test('hpPerSecond phase 2 at spurt speed', t => {
	// 20*(21.6-20+12)^2/144 * 1 * 1 * gutsModifier
	close(t, M.hpPerSecond(HORSE, COURSE, 1, 21.6, 2), 30.378887, 1e-4);
	// phase 0 has no guts modifier
	close(t, M.hpPerSecond(HORSE, COURSE, 1, 21.6, 0), 25.688889, 1e-4);
	t.end();
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`
Expected: FAIL — `M.maxHp is not a function` (or compile error on the new references).

- [ ] **Step 3: Implement** (append to `mechanics.ts`)

```ts
// --- HP (HpPolicy.ts:27-94; doc §HP) ---
const HpStrategyCoefficient = [0, 0.95, 0.89, 1.0, 0.995, 0.86];
const HpConsumptionGroundModifier = [
	[],
	[0, 1.0, 1.0, 1.02, 1.02], // turf:  [_, Firm, Good, Soft, Heavy]
	[0, 1.0, 1.0, 1.01, 1.02]  // dirt
];

export function maxHp(h: MechHorse, c: MechCourse): number {
	return 0.8 * HpStrategyCoefficient[h.strategy] * h.stamina + c.distance;
}

/** Guts-based HP-drain multiplier; applies in phase >= 2. */
export function gutsModifier(h: MechHorse): number {
	return 1.0 + 200.0 / Math.sqrt(600.0 * h.guts);
}

export function groundModifier(c: MechCourse, ground: number): number {
	return HpConsumptionGroundModifier[c.surface][ground];
}

export function hpPerSecond(
	h: MechHorse, c: MechCourse, ground: number,
	velocity: number, phase: number, statusModifier = 1.0
): number {
	const guts = phase >= 2 ? gutsModifier(h) : 1.0;
	return 20.0 * Math.pow(velocity - baseSpeed(c.distance) + 12.0, 2) / 144.0 *
		statusModifier * groundModifier(c, ground) * guts;
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`
Expected: all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add umalator-global/mechanics-explorer/mechanics.ts \
        umalator-global/mechanics-explorer/mechanics.test.ts
git commit -m "Add mechanics.ts HP & stamina formulas with tests"
```

---

## Task 4: `mechanics.ts` — Spurt & Wisdom formulas (TDD)

**Files:**
- Modify: `umalator-global/mechanics-explorer/mechanics.ts`
- Modify: `umalator-global/mechanics-explorer/mechanics.test.ts`

Spurt feasibility mirrors `HpPolicy.getLastSpurtPair` (full-spurt branch). `phase2Start = distance*2/3` equals `CourseHelpers.phaseStart(distance, 2)` (verified in `CourseData.ts:58-64`). Wisdom rolls from doc §Skill Activation Chance + the downhill / subpar-accept rates (memory: skill-activation.md).

- [ ] **Step 1: Add the failing tests** (append to `mechanics.test.ts`)

```ts
test('phase2Start', t => {
	close(t, M.phase2Start(2000), 1333.3333, 1e-3);
	t.end();
});

test('fullSpurtHpNeeded & canFullSpurt', t => {
	// maxDist = 2000 - 2000*2/3 = 666.6667; spd = lastSpurtSpeed; s=(maxDist-60)/spd
	const need = M.fullSpurtHpNeeded(HORSE, COURSE, 1);
	t.ok(need > 0 && need < 5000, `hpNeeded in range (got ${need})`);
	// maxHp 3424 vs need — assert canFullSpurt matches the maxHp>=need comparison
	t.equal(M.canFullSpurt(HORSE, COURSE, 1), M.maxHp(HORSE, COURSE) >= need);
	t.end();
});

test('subparAcceptChance', t => {
	// 15 + 0.05*2000
	t.equal(M.subparAcceptChance(HORSE), 115);
	t.end();
});

test('skillActivationChance', t => {
	// max(100 - 9000/2000, 20) = 95.5
	t.equal(M.skillActivationChance(HORSE), 95.5);
	// low wisdom floors at 20
	t.equal(M.skillActivationChance({ ...HORSE, wisdom: 100 }), 20);
	t.end();
});

test('downhillTriggerRate', t => {
	close(t, M.downhillTriggerRate(HORSE), 0.8, 1e-9);
	t.end();
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`
Expected: FAIL — `M.phase2Start is not a function` (or compile error).

- [ ] **Step 3: Implement** (append to `mechanics.ts`)

```ts
// --- Spurt (HpPolicy.getLastSpurtPair; doc §Last Spurt) ---

/** Position where phase 2 (the spurt zone) begins = CourseHelpers.phaseStart(distance, 2). */
export function phase2Start(distance: number): number {
	return distance * 2.0 / 3.0;
}

/** HP required to hold the max-spurt speed across the whole spurt zone (minus the 60m buffer). */
export function fullSpurtHpNeeded(h: MechHorse, c: MechCourse, ground: number): number {
	const maxDist = c.distance - phase2Start(c.distance);
	const spd = lastSpurtSpeed(h, c);
	const s = (maxDist - 60) / spd;
	return hpPerSecond(h, c, ground, spd, 2) * s;
}

/** True when the horse can spurt at max speed the whole way (the achievedMaxSpurt branch). */
export function canFullSpurt(h: MechHorse, c: MechCourse, ground: number): boolean {
	return maxHp(h, c) >= fullSpurtHpNeeded(h, c, ground);
}

/** Per-candidate acceptance chance (%) for the wisdom-gated fallback spurt roll. Uncapped; clamp for display. */
export function subparAcceptChance(h: MechHorse): number {
	return 15.0 + 0.05 * h.wisdom;
}

// --- Wisdom rolls (doc §Skill Activation Chance; memory skill-activation.md) ---

export function skillActivationChance(h: MechHorse): number {
	return Math.max(100.0 - 9000.0 / h.wisdom, 20.0);
}

/** Downhill-mode trigger probability per check. */
export function downhillTriggerRate(h: MechHorse): number {
	return h.wisdom * 0.0004;
}
```

- [ ] **Step 4: Run to verify all tests pass**

Run: `npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`
Expected: all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add umalator-global/mechanics-explorer/mechanics.ts \
        umalator-global/mechanics-explorer/mechanics.test.ts
git commit -m "Add mechanics.ts spurt & wisdom formulas with tests"
```

---

## Task 5: App state + HorseParameters wiring + controls

**Files:**
- Modify: `umalator-global/mechanics-explorer/app.tsx`
- Modify: `umalator-global/mechanics-explorer/mechanics-explorer.css`

Wire the UmaDef pane, course selector, and ground selector; compute adjusted `HorseParameters` via the canonical pipeline. No readout yet (a debug `<pre>` confirms the values flow). `buildBaseStats(horseDesc, mood)` reads `horseDesc.mood` internally, so the `UmaState` (which has `mood`) is passed as `horseDesc`.

- [ ] **Step 1: Replace `app.tsx` with the wired version**

```tsx
/**
 * Mechanics Explorer
 * Shows how uma stats feed the underlying race-mechanics formulas.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render } from 'preact';
import { useState, useMemo, useCallback } from 'preact/hooks';

import { V2UmaPanel, UmaState, defaultUmaState } from '../v2/uma-panel';
import { V2TrackSelect } from '../v2/track-select';
import { SegmentedControl } from '../v2/components';
import { buildBaseStats, buildAdjustedStats } from '../../uma-skill-tools/RaceSolverBuilder';
import { CourseHelpers } from '../../uma-skill-tools/CourseData';
import type { MechHorse, MechCourse } from './mechanics';

import '../v2/v2.css';
import './mechanics-explorer.css';

const DefaultCourseId = 10906; // Tokyo turf 2200m

// Ground options: enum values are Good(1)=Firm, Yielding(2)=Good, Soft(3), Heavy(4).
const GROUND_OPTIONS = [
	{ value: 1, label: 'Firm' },
	{ value: 2, label: 'Good' },
	{ value: 3, label: 'Soft' },
	{ value: 4, label: 'Heavy' }
];

function App() {
	const [uma, setUma] = useState<UmaState>(defaultUmaState);
	const [courseId, setCourseId] = useState(DefaultCourseId);
	const [ground, setGround] = useState<number>(1);

	const onUmaChange = useCallback((updates: Partial<UmaState>) => {
		setUma(prev => ({ ...prev, ...updates }));
	}, []);

	const course = CourseHelpers.getCourse(courseId);

	// Canonical adjusted-stats pipeline (same as the simulator).
	const horse: MechHorse = useMemo(() => {
		const base = buildBaseStats(uma as any, uma.mood as any);
		const adj = buildAdjustedStats(base, course, ground as any);
		return {
			speed: adj.speed, stamina: adj.stamina, power: adj.power,
			guts: adj.guts, wisdom: adj.wisdom,
			strategy: adj.strategy, distanceAptitude: adj.distanceAptitude,
			surfaceAptitude: adj.surfaceAptitude
		};
	}, [uma, courseId, ground]);

	const mechCourse: MechCourse = { distance: course.distance, surface: course.surface };

	return (
		<div class="mx-app">
			<div class="mx-header"><h1>Mechanics Explorer</h1></div>
			<div class="mx-layout">
				<div class="mx-panel">
					<V2UmaPanel
						state={uma}
						onChange={onUmaChange}
						onReset={() => setUma(defaultUmaState)}
						onResetAll={() => setUma(defaultUmaState)}
						onLoad={(s) => setUma(s)}
						title="Umamusume"
						courseDistance={course.distance}
						hideNotInGame={false}
					/>
				</div>
				<div class="mx-main">
					<div class="mx-controls">
						<div class="mx-control">
							<label class="mx-control-label">Course</label>
							<V2TrackSelect courseid={courseId} setCourseid={setCourseId} />
						</div>
						<div class="mx-control">
							<label class="mx-control-label">Ground</label>
							<SegmentedControl
								value={ground}
								onChange={setGround}
								options={GROUND_OPTIONS}
								ariaLabel="Ground condition"
							/>
						</div>
					</div>
					<pre class="mx-debug">{JSON.stringify({ horse, distance: mechCourse.distance, surface: mechCourse.surface, ground }, null, 2)}</pre>
				</div>
			</div>
		</div>
	);
}

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 2: Add control styles** (append to `mechanics-explorer.css`)

```css
.mx-controls {
	display: flex;
	flex-wrap: wrap;
	gap: var(--space-4, 16px);
	margin-bottom: var(--space-4, 16px);
}
.mx-control { display: flex; flex-direction: column; gap: var(--space-1, 4px); }
.mx-control-label {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--color-text-muted, #888);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.mx-debug {
	background: var(--color-surface-2, #1a1a1a);
	border: 1px solid var(--color-border, #333);
	border-radius: 8px;
	padding: var(--space-3, 12px);
	font-size: 0.75rem;
	overflow: auto;
}
```

- [ ] **Step 3: Build (debug)**

Run: `cd umalator-global/mechanics-explorer && node build.mjs --debug`
Expected: `Built mechanics-explorer`, no TypeScript/bundle errors.

- [ ] **Step 4: Visual check on the dev server**

Run (background): `cd umalator-global/mechanics-explorer && node build.mjs --serve 3100`
Open `http://localhost:3100/mechanics-explorer/`. Confirm:
- The UmaDef panel renders (portrait, stat inputs, aptitudes, mood, strategy).
- Course selector and a Firm/Good/Soft/Heavy ground toggle render.
- The `<pre>` shows an `horse` object whose numbers change when you edit a stat, switch course, or change ground.
Then stop the server (free port 3100).

- [ ] **Step 5: Commit**

```bash
git add umalator-global/mechanics-explorer/app.tsx \
        umalator-global/mechanics-explorer/mechanics-explorer.css
git commit -m "Wire mechanics-explorer uma panel, course & ground controls"
```

---

## Task 6: `MechanicsReadout` — the four live-value cards

**Files:**
- Create: `umalator-global/mechanics-explorer/mechanics-readout.tsx`
- Modify: `umalator-global/mechanics-explorer/app.tsx`
- Modify: `umalator-global/mechanics-explorer/mechanics-explorer.css`

Four `CollapsibleSection` cards reading from `mechanics.ts`. Each row: label, value, a one-line formula `Tooltip`, and a dominant-stat `Badge`.

- [ ] **Step 1: Create `mechanics-readout.tsx`**

```tsx
/**
 * Mechanics Explorer — live readout of computed mechanic values.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, Fragment } from 'preact';

import { CollapsibleSection } from '../v2/uma-panel';
import { Tooltip, Badge } from '../v2/components';
import * as M from './mechanics';
import type { MechHorse, MechCourse } from './mechanics';

interface RowProps {
	label: string;
	value: string;
	formula: string;
	stat?: string;
}

function Row({ label, value, formula, stat }: RowProps) {
	return (
		<div class="mx-row">
			<span class="mx-row-label">
				{label}
				<Tooltip content={formula}><span class="mx-row-info">ⓘ</span></Tooltip>
			</span>
			<span class="mx-row-value">{value}</span>
			{stat ? <Badge>{stat}</Badge> : null}
		</div>
	);
}

interface ReadoutProps {
	horse: MechHorse;
	course: MechCourse;
	ground: number;
}

const f = (n: number, d = 3) => n.toFixed(d);

export function MechanicsReadout({ horse, course, ground }: ReadoutProps) {
	const needFull = M.fullSpurtHpNeeded(horse, course, ground);
	const maxHp = M.maxHp(horse, course);
	const canFull = M.canFullSpurt(horse, course, ground);

	return (
		<Fragment>
			<CollapsibleSection title="Speed & Accel" defaultOpen={true}>
				<Row label="Base speed (course)" value={f(M.baseSpeed(course.distance), 2)} formula="20 − (distance − 2000) / 1000" stat="distance" />
				<Row label="Target speed — phase 0" value={f(M.baseTargetSpeed(horse, course, 0))} formula="baseSpeed × strategyPhaseCoef[0]" stat="strategy" />
				<Row label="Target speed — phase 1" value={f(M.baseTargetSpeed(horse, course, 1))} formula="baseSpeed × strategyPhaseCoef[1]" stat="strategy" />
				<Row label="Target speed — phase 2" value={f(M.baseTargetSpeed(horse, course, 2))} formula="baseSpeed × coef[2] + √(500·speed)·distProf·0.002" stat="speed" />
				<Row label="Last-spurt speed" value={f(M.lastSpurtSpeed(horse, course))} formula="(targetSpeed₂ + 0.01·baseSpeed)·1.05 + √(500·speed)·distProf·0.002 + (450·guts)^0.597·0.0001" stat="speed/guts" />
				<Row label="Minimum speed" value={f(M.minSpeed(horse, course))} formula="0.85·baseSpeed + √(200·guts)·0.001" stat="guts" />
				<Row label="Base accel — phase 2 (flat)" value={f(M.baseAccel(horse, 2, false), 4)} formula="0.0006·√(500·power)·accelCoef·groundProf·distProf" stat="power" />
				<Row label="Base accel — phase 2 (uphill)" value={f(M.baseAccel(horse, 2, true), 4)} formula="0.0004·√(500·power)·accelCoef·groundProf·distProf" stat="power" />
				<Row label="Start-dash accel bonus" value={f(M.StartDashAccel, 1)} formula="Flat +24 while currentSpeed < 0.85·baseSpeed" />
			</CollapsibleSection>

			<CollapsibleSection title="HP & Stamina" defaultOpen={true}>
				<Row label="Max HP" value={f(maxHp, 1)} formula="0.8 · hpStrategyCoef · stamina + distance" stat="stamina" />
				<Row label="Guts HP modifier (phase ≥ 2)" value={f(M.gutsModifier(horse), 4)} formula="1 + 200/√(600·guts)" stat="guts" />
				<Row label="Ground drain modifier" value={f(M.groundModifier(course, ground), 3)} formula="hpConsumptionGroundModifier[surface][ground]" stat="ground" />
				<Row label="HP/s — phase 1 @ target" value={f(M.hpPerSecond(horse, course, ground, M.baseTargetSpeed(horse, course, 1), 1), 2)} formula="20·(v − baseSpeed + 12)²/144 · status · ground" stat="—" />
				<Row label="HP/s — phase 2 @ spurt" value={f(M.hpPerSecond(horse, course, ground, M.lastSpurtSpeed(horse, course), 2), 2)} formula="20·(v − baseSpeed + 12)²/144 · status · ground · gutsMod" stat="guts" />
			</CollapsibleSection>

			<CollapsibleSection title="Spurt" defaultOpen={true}>
				<Row label="Max-spurt speed" value={f(M.lastSpurtSpeed(horse, course))} formula="Same as last-spurt speed (target spurt velocity)" stat="speed/guts" />
				<Row label="HP needed for full spurt" value={f(needFull, 1)} formula="hpPerSecond(spurtSpeed) · (spurtZone − 60)/spurtSpeed" stat="stamina" />
				<Row label="Max HP" value={f(maxHp, 1)} formula="0.8 · hpStrategyCoef · stamina + distance" stat="stamina" />
				<Row label="Full spurt achievable?" value={canFull ? `Yes (+${f(maxHp - needFull, 0)} HP)` : `No (−${f(needFull - maxHp, 0)} HP)`} formula="maxHp ≥ hpNeeded" stat="stamina" />
				<Row label="Subpar-accept chance / candidate" value={`${f(Math.min(100, M.subparAcceptChance(horse)), 1)}%`} formula="15 + 0.05·wisdom (capped at 100% for display)" stat="wisdom" />
			</CollapsibleSection>

			<CollapsibleSection title="Wisdom Rolls" defaultOpen={true}>
				<Row label="Skill activation chance" value={`${f(M.skillActivationChance(horse), 1)}%`} formula="max(100 − 9000/wisdom, 20)" stat="wisdom" />
				<Row label="Downhill trigger rate / check" value={`${f(M.downhillTriggerRate(horse), 3)}%`} formula="wisdom · 0.0004 (× 100 for %)" stat="wisdom" />
				<Row label="Subpar-accept chance / candidate" value={`${f(Math.min(100, M.subparAcceptChance(horse)), 1)}%`} formula="15 + 0.05·wisdom (capped at 100% for display)" stat="wisdom" />
			</CollapsibleSection>
		</Fragment>
	);
}
```

NOTE: `downhillTriggerRate` returns a probability per check (e.g. 0.8 at wisdom 2000). It is displayed with a `%` suffix as a probability figure consistent with the readout's other percentages; the formula tooltip documents the raw `wisdom · 0.0004` expression.

- [ ] **Step 2: Mount the readout in `app.tsx`** — replace the `<pre class="mx-debug">…</pre>` line with the readout:

Remove:
```tsx
					<pre class="mx-debug">{JSON.stringify({ horse, distance: mechCourse.distance, surface: mechCourse.surface, ground }, null, 2)}</pre>
```
Add in its place:
```tsx
					<MechanicsReadout horse={horse} course={mechCourse} ground={ground} />
```
And add the import near the other local imports:
```tsx
import { MechanicsReadout } from './mechanics-readout';
```

- [ ] **Step 3: Add readout styles** (append to `mechanics-explorer.css`)

```css
.mx-row {
	display: flex;
	align-items: center;
	gap: var(--space-2, 8px);
	padding: var(--space-2, 8px) 0;
	border-bottom: 1px solid var(--color-border, #2a2a2a);
}
.mx-row:last-child { border-bottom: none; }
.mx-row-label {
	flex: 1;
	display: flex;
	align-items: center;
	gap: var(--space-1, 4px);
	font-size: 0.875rem;
}
.mx-row-info { cursor: help; opacity: 0.5; font-size: 0.8em; }
.mx-row-value {
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	min-width: 6ch;
	text-align: right;
}
```

- [ ] **Step 4: Build (debug)**

Run: `cd umalator-global/mechanics-explorer && node build.mjs --debug`
Expected: `Built mechanics-explorer`, no errors. (If `Badge` or `Tooltip` is not exported from `../v2/components`, check `umalator-global/v2/components/index.ts` and import from the correct path — both are listed there.)

- [ ] **Step 5: Visual check**

Run (background): `node build.mjs --serve 3100`. Open the app. Confirm the four cards render with live numbers; for the default uma on Tokyo 2200m, "Max HP" shows a plausible value and changing Stamina moves it; "Skill activation chance" changes with Wisdom; hovering ⓘ shows the formula. Stop the server (free port 3100).

- [ ] **Step 6: Commit**

```bash
git add umalator-global/mechanics-explorer/mechanics-readout.tsx \
        umalator-global/mechanics-explorer/app.tsx \
        umalator-global/mechanics-explorer/mechanics-explorer.css
git commit -m "Add mechanics-explorer live readout cards"
```

---

## Task 7: `SweepChart` — D3 line chart

**Files:**
- Create: `umalator-global/mechanics-explorer/sweep-chart.tsx`
- Modify: `umalator-global/mechanics-explorer/mechanics-explorer.css`

A self-contained D3 line chart: plots `compute(x)` across `[xMin, xMax]`, draws axes and a vertical marker + dot at `currentX`. Pure presentational; the parent supplies the `compute` closure.

- [ ] **Step 1: Create `sweep-chart.tsx`**

```tsx
/**
 * Mechanics Explorer — stat-sweep line chart.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { useRef, useEffect, useMemo } from 'preact/hooks';
import * as d3 from 'd3';

export interface SweepChartProps {
	label: string;
	xLabel: string;
	yLabel: string;
	xMin: number;
	xMax: number;
	compute: (x: number) => number;
	currentX: number;
	width?: number;
	height?: number;
	samples?: number;
}

export function SweepChart({
	label, xLabel, yLabel, xMin, xMax, compute, currentX,
	width = 420, height = 220, samples = 80
}: SweepChartProps) {
	const axesRef = useRef<SVGGElement>(null);

	const margin = { top: 16, right: 16, bottom: 36, left: 52 };
	const innerW = width - margin.left - margin.right;
	const innerH = height - margin.top - margin.bottom;

	const data = useMemo(() => {
		const pts: [number, number][] = [];
		for (let i = 0; i <= samples; i++) {
			const x = xMin + (xMax - xMin) * (i / samples);
			pts.push([x, compute(x)]);
		}
		return pts;
	}, [xMin, xMax, samples, compute]);

	const xScale = useMemo(() => d3.scaleLinear().domain([xMin, xMax]).range([0, innerW]), [xMin, xMax, innerW]);
	const yScale = useMemo(() => {
		const ys = data.map(d => d[1]);
		const lo = Math.min(...ys), hi = Math.max(...ys);
		const pad = (hi - lo) * 0.08 || 1;
		return d3.scaleLinear().domain([lo - pad, hi + pad]).range([innerH, 0]);
	}, [data, innerH]);

	const linePath = useMemo(() => {
		const line = d3.line<[number, number]>().x(d => xScale(d[0])).y(d => yScale(d[1]));
		return line(data) || '';
	}, [data, xScale, yScale]);

	const curY = compute(currentX);

	useEffect(() => {
		const g = d3.select(axesRef.current);
		g.selectAll('*').remove();
		g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(xScale).ticks(6));
		g.append('g').call(d3.axisLeft(yScale).ticks(5));
	}, [xScale, yScale, innerH]);

	return (
		<div class="mx-sweep">
			<div class="mx-sweep-title">{label}</div>
			<svg width={width} height={height} class="mx-sweep-svg">
				<g transform={`translate(${margin.left},${margin.top})`}>
					<g ref={axesRef} class="mx-sweep-axes" />
					<path d={linePath} class="mx-sweep-line" fill="none" />
					<line
						class="mx-sweep-marker"
						x1={xScale(currentX)} x2={xScale(currentX)}
						y1={0} y2={innerH}
					/>
					<circle class="mx-sweep-dot" cx={xScale(currentX)} cy={yScale(curY)} r={4} />
					<text class="mx-sweep-xlabel" x={innerW / 2} y={innerH + 32} text-anchor="middle">{xLabel}</text>
					<text class="mx-sweep-ylabel" transform={`translate(${-40},${innerH / 2}) rotate(-90)`} text-anchor="middle">{yLabel}</text>
				</g>
			</svg>
		</div>
	);
}
```

- [ ] **Step 2: Add chart styles** (append to `mechanics-explorer.css`)

```css
.mx-sweep {
	margin-top: var(--space-4, 16px);
	background: var(--color-surface-2, #161616);
	border: 1px solid var(--color-border, #2a2a2a);
	border-radius: 8px;
	padding: var(--space-3, 12px);
}
.mx-sweep-title { font-weight: 600; margin-bottom: var(--space-2, 8px); }
.mx-sweep-line { stroke: var(--color-primary, #4ea1ff); stroke-width: 2; }
.mx-sweep-marker { stroke: var(--color-text-muted, #888); stroke-dasharray: 4 3; stroke-width: 1; }
.mx-sweep-dot { fill: var(--color-primary, #4ea1ff); stroke: #fff; stroke-width: 1; }
.mx-sweep-axes text { fill: var(--color-text-muted, #999); font-size: 10px; }
.mx-sweep-axes path, .mx-sweep-axes line { stroke: var(--color-border, #333); }
.mx-sweep-xlabel, .mx-sweep-ylabel { fill: var(--color-text-muted, #999); font-size: 11px; }
```

- [ ] **Step 3: Build (debug) to confirm it compiles** (not yet mounted)

Run: `cd umalator-global/mechanics-explorer && node build.mjs --debug`
Expected: `Built mechanics-explorer`, no errors. (`d3` is already a dependency used by `v2/velocity-chart.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add umalator-global/mechanics-explorer/sweep-chart.tsx \
        umalator-global/mechanics-explorer/mechanics-explorer.css
git commit -m "Add mechanics-explorer SweepChart component"
```

---

## Task 8: Sweep Explorer panel (mechanic + stat selects)

**Files:**
- Modify: `umalator-global/mechanics-explorer/app.tsx`
- Modify: `umalator-global/mechanics-explorer/mechanics-explorer.css`

A panel under the readout: pick a *mechanic* and a *stat to vary*; render a `SweepChart` whose `compute(x)` rebuilds the adjusted horse with the swept **raw** stat replaced, so the curve reflects the true in-game effect (overcap, motivation, course/ground/strategy modifiers). The marker sits at the current raw stat value.

- [ ] **Step 1: Add the sweep panel to `app.tsx`**

Add imports (near the other local imports):
```tsx
import { useState as useStateAlias } from 'preact/hooks';
import { SweepChart } from './sweep-chart';
import { CustomSelect } from '../v2/components';
import * as M from './mechanics';
```
(If `useState` is already imported, do not re-import it — only add `SweepChart`, `CustomSelect`, and `* as M`.)

Add these module-level definitions above `function App()`:
```tsx
type StatKey = 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom';

const MECHANICS: { id: string; label: string; yLabel: string; defaultStat: StatKey; compute: (h: MechHorse, c: MechCourse, g: number) => number }[] = [
	{ id: 'targetSpeed2', label: 'Target speed — phase 2', yLabel: 'm/s', defaultStat: 'speed', compute: (h, c) => M.baseTargetSpeed(h, c, 2) },
	{ id: 'lastSpurt', label: 'Last-spurt speed', yLabel: 'm/s', defaultStat: 'speed', compute: (h, c) => M.lastSpurtSpeed(h, c) },
	{ id: 'baseAccel2', label: 'Base accel — phase 2', yLabel: 'm/s²', defaultStat: 'power', compute: (h) => M.baseAccel(h, 2, false) },
	{ id: 'maxHp', label: 'Max HP', yLabel: 'HP', defaultStat: 'stamina', compute: (h, c) => M.maxHp(h, c) },
	{ id: 'hpPerSec2', label: 'HP/s — phase 2 @ spurt', yLabel: 'HP/s', defaultStat: 'guts', compute: (h, c, g) => M.hpPerSecond(h, c, g, M.lastSpurtSpeed(h, c), 2) },
	{ id: 'skillAct', label: 'Skill activation chance', yLabel: '%', defaultStat: 'wisdom', compute: (h) => M.skillActivationChance(h) },
	{ id: 'subpar', label: 'Subpar-accept chance', yLabel: '%', defaultStat: 'wisdom', compute: (h) => Math.min(100, M.subparAcceptChance(h)) }
];

const STAT_OPTIONS = [
	{ value: 'speed', label: 'Speed' },
	{ value: 'stamina', label: 'Stamina' },
	{ value: 'power', label: 'Power' },
	{ value: 'guts', label: 'Guts' },
	{ value: 'wisdom', label: 'Wisdom' }
];

const SWEEP_MIN = 1;
const SWEEP_MAX = 1600;
```

Inside `App()`, after the `mechCourse` definition, add sweep state and the compute closure:
```tsx
	const [mechId, setMechId] = useState('targetSpeed2');
	const [sweepStat, setSweepStat] = useState<StatKey>('speed');

	const mechDef = MECHANICS.find(m => m.id === mechId)!;

	// Rebuild the adjusted horse with one RAW stat replaced by x, then compute the mechanic.
	const sweepCompute = useCallback((x: number) => {
		const probe = { ...uma, [sweepStat]: x };
		const base = buildBaseStats(probe as any, probe.mood as any);
		const adj = buildAdjustedStats(base, course, ground as any);
		const h: MechHorse = {
			speed: adj.speed, stamina: adj.stamina, power: adj.power,
			guts: adj.guts, wisdom: adj.wisdom,
			strategy: adj.strategy, distanceAptitude: adj.distanceAptitude,
			surfaceAptitude: adj.surfaceAptitude
		};
		return mechDef.compute(h, mechCourse, ground);
	}, [uma, sweepStat, courseId, ground, mechId]);
```

Add the panel JSX right after `<MechanicsReadout ... />`:
```tsx
					<div class="mx-sweep-panel">
						<div class="mx-sweep-controls">
							<div class="mx-control">
								<label class="mx-control-label">Mechanic</label>
								<CustomSelect
									value={mechId}
									onChange={(v: string) => {
										setMechId(v);
										const def = MECHANICS.find(m => m.id === v)!;
										setSweepStat(def.defaultStat);
									}}
									options={MECHANICS.map(m => ({ value: m.id, label: m.label }))}
								/>
							</div>
							<div class="mx-control">
								<label class="mx-control-label">Vary stat</label>
								<CustomSelect
									value={sweepStat}
									onChange={(v: string) => setSweepStat(v as StatKey)}
									options={STAT_OPTIONS}
								/>
							</div>
						</div>
						<SweepChart
							label={`${mechDef.label} vs ${sweepStat}`}
							xLabel={sweepStat}
							yLabel={mechDef.yLabel}
							xMin={SWEEP_MIN}
							xMax={SWEEP_MAX}
							compute={sweepCompute}
							currentX={uma[sweepStat]}
						/>
					</div>
```

- [ ] **Step 2: Add sweep-panel styles** (append to `mechanics-explorer.css`)

```css
.mx-sweep-panel { margin-top: var(--space-5, 24px); }
.mx-sweep-controls { display: flex; flex-wrap: wrap; gap: var(--space-4, 16px); }
```

- [ ] **Step 3: Build (debug)**

Run: `cd umalator-global/mechanics-explorer && node build.mjs --debug`
Expected: `Built mechanics-explorer`, no errors. (If `CustomSelect`'s prop names differ — e.g. it expects `{value,label}` option objects — confirm against `umalator-global/v2/components/CustomSelect.tsx` and adjust the `options` shape accordingly; it is the same component the uma panel uses for selects.)

- [ ] **Step 4: Visual check**

Run (background): `node build.mjs --serve 3100`. Open the app. Confirm:
- The Sweep Explorer shows two dropdowns + a chart.
- Default "Target speed — phase 2 vs speed" draws a rising curve; the marker sits at the current Speed (1200) value.
- Selecting "Skill activation chance" + "wisdom" shows a curve that rises then flattens at a 20% floor on the low end.
- Selecting "Max HP" + "stamina" shows a straight line.
- Editing the uma's stat moves the marker; changing course/ground reshapes HP-based curves.
Stop the server (free port 3100).

- [ ] **Step 5: Commit**

```bash
git add umalator-global/mechanics-explorer/app.tsx \
        umalator-global/mechanics-explorer/mechanics-explorer.css
git commit -m "Add mechanics-explorer sweep panel"
```

---

## Task 9: Routing, build-all, docs, production bundle & final verification

**Files:**
- Modify: `_redirects`
- Modify: `build-all.sh`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the `_redirects` rewrite rule**

Add after the skill-visualizer block (before the `/uma-tools/* /:splat 200` rule):
```
# Clean URL for the Mechanics Explorer (rewrite, URL stays as /mechanics-explorer/)
/mechanics-explorer/* /umalator-global/mechanics-explorer/:splat 200
```

- [ ] **Step 2: Add a build step to `build-all.sh`**

Add after the skill-visualizer (global) build block:
```bash
echo ""
echo "Building mechanics-explorer..."
cd umalator-global/mechanics-explorer
node build.mjs
cd ../..
```

- [ ] **Step 3: Add the app-table row to `CLAUDE.md`**

In the "Live Applications" table, add a row:
```
| **Mechanics Explorer** | [/mechanics-explorer](https://umalator.app/mechanics-explorer) | Stat → race-mechanics formula explorer (live readout + stat-sweep charts). Rewrite to `/umalator-global/mechanics-explorer/` via `_redirects`. |
```
Also add to the Project Structure tree, under `umalator-global/`:
```
│   ├── mechanics-explorer/      # Stat → mechanics formula explorer (standalone sub-app)
```

- [ ] **Step 4: Production build (minified)**

Run: `cd umalator-global/mechanics-explorer && node build.mjs`
Expected: `Built mechanics-explorer`; minified `bundle.js` + `bundle.css` regenerated.

- [ ] **Step 5: Run the formula unit tests one final time**

Run: `npx ts-node umalator-global/mechanics-explorer/mechanics.test.ts`
Expected: all assertions pass.

- [ ] **Step 6: Numeric parity spot-check against the simulator**

Configure the same uma + Tokyo 2200m + Firm in the explorer and read "Max HP" and "Target speed — phase 2". Confirm they are plausible and that "Max HP" equals `0.8 · hpStrategyCoef · adjustedStamina + 2200`. (Optional deeper check: run the same horse through the v2 simulator's debug output and compare — values should match to floating point since both use `buildAdjustedStats`.)

- [ ] **Step 7: Full visual smoke test**

Run (background): `cd umalator-global/mechanics-explorer && node build.mjs --serve 3100`. Open `http://localhost:3100/mechanics-explorer/`. Confirm: panel + controls + 4 readout cards + sweep chart all render and respond to edits; no console errors. Stop the server (free port 3100).

- [ ] **Step 8: Commit**

```bash
git add _redirects build-all.sh CLAUDE.md \
        umalator-global/mechanics-explorer/bundle.js \
        umalator-global/mechanics-explorer/bundle.css
git commit -m "Wire mechanics-explorer routing, build-all, docs & production bundle"
```

---

## Self-Review

**Spec coverage:**
- Standalone sub-app at `/mechanics-explorer` → Tasks 1, 9 ✓
- Reuse V2UmaPanel / V2TrackSelect / SegmentedControl / CollapsibleSection / Tooltip / Badge → Tasks 5, 6 ✓
- Live readout, four mechanic groups (Speed&Accel, HP&Stamina, Spurt, Wisdom) → Task 6 ✓
- Sweep charts (pick mechanic + stat) → Tasks 7, 8 ✓
- Formulas transcribed from doc, verified vs code; pure module → Tasks 2–4 ✓
- Canonical adjusted-stats pipeline (`buildBaseStats`+`buildAdjustedStats`) → Task 5 ✓
- Ground selector incl. dirt/turf modifier → Tasks 5, 6 ✓
- Edge cases (low stat floors, overcap, activation floor at 20%) → covered by reusing `adjustOvercap` (Task 5) and formula floors (Tasks 4, 6) ✓
- Routing/build-all/CLAUDE.md → Task 9 ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output.

**Type consistency:** `MechHorse`/`MechCourse` defined in Task 2 are used identically in Tasks 3–8. `compute(x:number)=>number` closure signature matches `SweepChart.compute`. Mechanic `compute(h,c,g)` signature is consistent between `MECHANICS` defs and `sweepCompute`. Ground is a `number` (1–4) throughout. Strategy/aptitude are numeric on the adjusted horse throughout.

**Known integration risks flagged inline:** `Badge`/`Tooltip` export path (Task 6 Step 4) and `CustomSelect` option/prop shape (Task 8 Step 3) — each step says where to verify if the build errors.
