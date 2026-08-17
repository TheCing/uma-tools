#!/usr/bin/env node
// Cross-engine simulator comparison harness.
//
// Runs the same (horse, course, skill) cases through *our* uma-skill-tools and through
// upstream alpha123/uma-skill-tools, using each engine's own `tools/gain.ts --dump`, and
// checks that the resulting バ身-gain distributions agree.
//
// The two engines do NOT share an RNG (ours swapped alpha's Rule30 cellular-automaton
// generator for Prando), so seed-matched bit-identical comparison is impossible. The
// comparison is therefore statistical: pool many samples per engine, compare the means,
// and judge the difference against Monte Carlo noise plus an absolute バ身 tolerance.
//
//   node tools/sim-compare/compare-sims.mjs
//   node tools/sim-compare/compare-sims.mjs --samples 4000 --repeats 5 --json out/report.json
//
// See README.md in this directory.

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import * as os from 'node:os';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const DEFAULTS = {
	cases: join(HERE, 'cases.json'),
	ours: join(REPO, 'uma-skill-tools'),
	alpha: join(HERE, 'alpha'),
	samples: 2000,
	repeats: 3,
	seed: 20260805,
	jobs: Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 2),
	tolAbs: 0.05,      // バ身 — differences smaller than this are not worth caring about
	tolSigma: 3,       // ...or within this many combined standard errors
	filter: null,
	json: null,
	strict: false,
	list: false,
	quiet: false,
	timeout: 600000
};

// ---------------------------------------------------------------- args

function parseArgs(argv) {
	const o = {...DEFAULTS};
	const num = v => { const n = Number(v); if (!Number.isFinite(n)) die(`expected a number, got "${v}"`); return n; };
	for (let i = 0; i < argv.length; ++i) {
		const a = argv[i], next = () => { if (i + 1 >= argv.length) die(`${a} needs a value`); return argv[++i]; };
		switch (a) {
		case '--cases':     o.cases = resolve(next()); break;
		case '--ours':      o.ours = resolve(next()); break;
		case '--alpha':     o.alpha = resolve(next()); break;
		case '--samples': case '-N': o.samples = num(next()); break;
		case '--repeats':   o.repeats = num(next()); break;
		case '--seed':      o.seed = num(next()); break;
		case '--jobs': case '-j': o.jobs = num(next()); break;
		case '--tol-abs':   o.tolAbs = num(next()); break;
		case '--tol-sigma': o.tolSigma = num(next()); break;
		case '--filter':    o.filter = next(); break;
		case '--json':      o.json = resolve(next()); break;
		case '--timeout':   o.timeout = num(next()); break;
		case '--strict':    o.strict = true; break;
		case '--list':      o.list = true; break;
		case '--quiet':     o.quiet = true; break;
		case '--help': case '-h': usage(); process.exit(0);
		default: die(`unknown option "${a}" (try --help)`);
		}
	}
	return o;
}

function usage() {
	console.log(`
compare-sims — statistical A/B of our race solver against alpha123/uma-skill-tools

  node tools/sim-compare/compare-sims.mjs [options]

  --cases <file>      case corpus (default tools/sim-compare/cases.json)
  --ours <dir>        our engine checkout (default uma-skill-tools/)
  --alpha <dir>       upstream checkout (default tools/sim-compare/alpha/; run setup.sh)
  -N, --samples <n>   gain.ts samples per run (default ${DEFAULTS.samples})
  --repeats <r>       independent seeds per case per engine (default ${DEFAULTS.repeats})
  --seed <n>          base seed (default ${DEFAULTS.seed})
  -j, --jobs <n>      parallel gain.ts processes (default cpus-2)
  --tol-abs <bashin>  practical-significance tolerance (default ${DEFAULTS.tolAbs})
  --tol-sigma <k>     noise tolerance, in combined standard errors (default ${DEFAULTS.tolSigma})
  --filter <substr>   only run cases whose id contains <substr>
  --json <file>       write the full machine-readable report
  --strict            also fail the run on data-divergent cases
  --list              print the corpus and exit
  --timeout <ms>      per-process timeout (default ${DEFAULTS.timeout})
  --quiet             only print the summary

A case PASSES when |mean_ours - mean_alpha| <= max(tol-abs, tol-sigma * combined SE).
Exit code is 1 if any engine-comparable case fails.
`.trim());
}

function die(msg) { console.error('compare-sims: ' + msg); process.exit(2); }

// ---------------------------------------------------------------- stats

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

function stdev(xs) {
	if (xs.length < 2) return 0;
	const m = mean(xs);
	return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

// xs must be sorted ascending
function quantile(xs, q) {
	if (xs.length === 0) return NaN;
	const i = (xs.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
	return lo === hi ? xs[lo] : xs[lo] + (xs[hi] - xs[lo]) * (i - lo);
}

// Two-sample Kolmogorov-Smirnov statistic. Both inputs sorted ascending.
function ksStatistic(a, b) {
	let i = 0, j = 0, d = 0;
	while (i < a.length && j < b.length) {
		const v = Math.min(a[i], b[j]);
		while (i < a.length && a[i] <= v) ++i;
		while (j < b.length && b[j] <= v) ++j;
		d = Math.max(d, Math.abs(i / a.length - j / b.length));
	}
	return d;
}

function summarize(samples) {
	const sorted = [...samples].sort((x, y) => x - y);
	const sd = stdev(samples);
	return {
		n: samples.length,
		mean: mean(samples),
		sd,
		se: sd / Math.sqrt(samples.length),
		min: sorted[0],
		max: sorted[sorted.length - 1],
		p10: quantile(sorted, 0.10),
		median: quantile(sorted, 0.50),
		p90: quantile(sorted, 0.90),
		sorted
	};
}

// ---------------------------------------------------------------- data parity
//
// Only the fields both engines actually consume. Upstream carries extra keys we don't
// (e.g. `wisdomCheck`), which are irrelevant to gain.ts and must not count as divergence.

function normalizeSkill(s) {
	return JSON.stringify({
		rarity: s.rarity,
		alternatives: (s.alternatives ?? []).map(a => ({
			condition: a.condition ?? '',
			precondition: a.precondition ?? '',
			baseDuration: a.baseDuration,
			durationScaling: a.durationScaling ?? 1,
			effects: (a.effects ?? []).map(e => [e.type, e.modifier, e.target ?? null])
		}))
	});
}

function loadEngineData(dir, label) {
	const read = name => {
		const p = join(dir, 'data', name);
		if (!existsSync(p)) die(`${label}: missing ${relative(REPO, p)} — is "${relative(REPO, dir)}" a uma-skill-tools checkout?`);
		return JSON.parse(readFileSync(p, 'utf8'));
	};
	return {skills: read('skill_data.json'), courses: read('course_data.json')};
}

// Returns {clean: bool, notes: string[]} for one case.
function checkDataParity(kase, horse, ours, alpha) {
	const notes = [];
	const ids = [...new Set([...(horse.skills ?? []), ...(kase.skills ?? [])].map(String))];
	for (const id of ids) {
		const a = alpha.skills[id], b = ours.skills[id];
		if (!b) notes.push(`skill ${id} missing from ours`);
		else if (!a) notes.push(`skill ${id} missing from upstream`);
		else if (normalizeSkill(a) !== normalizeSkill(b)) notes.push(`skill ${id} definition differs`);
	}
	const cid = String(kase.course);
	const ca = alpha.courses[cid], cb = ours.courses[cid];
	if (!cb) notes.push(`course ${cid} missing from ours`);
	else if (!ca) notes.push(`course ${cid} missing from upstream`);
	else if (JSON.stringify(ca) !== JSON.stringify(cb)) notes.push(`course ${cid} definition differs`);
	return {clean: notes.length === 0, notes};
}

// ---------------------------------------------------------------- running gain.ts

function tsNodeBin(dir, label) {
	const bin = join(dir, 'node_modules', '.bin', 'ts-node');
	if (!existsSync(bin)) die(`${label}: no ts-node at ${relative(REPO, bin)} — run "npm install" in ${relative(REPO, dir)}`);
	return bin;
}

function runGain({bin, cwd, horseFile, kase, samples, seed, timeout}) {
	const args = [
		'--transpile-only', 'tools/gain.ts', horseFile,
		'-c', String(kase.course),
		'-N', String(samples),
		'--seed', String(seed),
		'--dump'
	];
	if (kase.skills?.length) args.push('--skills', kase.skills.join(','));
	if (kase.mood != null) args.push('-m', String(kase.mood));
	if (kase.ground) args.push('-g', kase.ground);
	if (kase.timestep) args.push('--timestep', String(kase.timestep));

	return new Promise(resolvePromise => {
		const child = spawn(bin, args, {cwd, env: process.env});
		let out = '', err = '', done = false;
		const timer = setTimeout(() => { if (!done) { child.kill('SIGKILL'); err += `\n[timed out after ${timeout}ms]`; } }, timeout);
		child.stdout.on('data', d => out += d);
		child.stderr.on('data', d => err += d);
		child.on('error', e => { done = true; clearTimeout(timer); resolvePromise({ok: false, error: e.message, stderr: err}); });
		child.on('close', code => {
			done = true;
			clearTimeout(timer);
			if (code !== 0) return resolvePromise({ok: false, error: `gain.ts exited ${code}`, stderr: err.trim(), cmd: [bin, ...args].join(' ')});
			let samplesOut;
			try {
				samplesOut = JSON.parse(out.trim().split('\n').pop());
			} catch {
				return resolvePromise({ok: false, error: 'could not parse --dump output', stderr: err.trim(), stdout: out.slice(0, 400)});
			}
			if (!Array.isArray(samplesOut) || samplesOut.length === 0) {
				return resolvePromise({ok: false, error: '--dump returned no samples', stderr: err.trim()});
			}
			resolvePromise({ok: true, samples: samplesOut, warnings: uniqueWarnings(err)});
		});
	});
}

function uniqueWarnings(stderr) {
	const seen = new Set();
	for (const line of stderr.split('\n')) {
		const t = line.trim();
		if (t) seen.add(t);
	}
	return [...seen];
}

async function pool(tasks, limit) {
	const results = new Array(tasks.length);
	let next = 0;
	const workers = Array.from({length: Math.min(limit, tasks.length)}, async () => {
		for (;;) {
			const i = next++;
			if (i >= tasks.length) return;
			results[i] = await tasks[i]();
		}
	});
	await Promise.all(workers);
	return results;
}

// ---------------------------------------------------------------- reporting

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const sign = x => (x >= 0 ? '+' : '') + x.toFixed(3);

function verdictOf(delta, tol) {
	return Math.abs(delta) <= tol ? 'PASS' : 'FAIL';
}

// ---------------------------------------------------------------- main

async function main() {
	const opt = parseArgs(process.argv.slice(2));

	if (!existsSync(opt.cases)) die(`no case file at ${opt.cases}`);
	const corpus = JSON.parse(readFileSync(opt.cases, 'utf8'));
	let cases = corpus.cases ?? corpus;
	if (opt.filter) cases = cases.filter(c => c.id.includes(opt.filter));
	if (cases.length === 0) die('no cases selected');

	const horsesDir = corpus.horsesDir ? resolve(dirname(opt.cases), corpus.horsesDir) : join(HERE, 'horses');
	const horseFileFor = c => {
		const p = resolve(horsesDir, c.horse.endsWith('.json') ? c.horse : c.horse + '.json');
		if (!existsSync(p)) die(`case ${c.id}: no horse file at ${p}`);
		return p;
	};

	if (opt.list) {
		for (const c of cases) console.log(`${pad(c.id, 34)} horse=${pad(c.horse, 8)} course=${c.course} skills=${(c.skills ?? []).join(',') || '(none)'}`);
		return 0;
	}

	if (!existsSync(opt.alpha)) {
		die(`upstream checkout not found at ${relative(REPO, opt.alpha)}\n           run: bash tools/sim-compare/setup.sh`);
	}
	const oursBin = tsNodeBin(opt.ours, 'ours');
	const alphaBin = tsNodeBin(opt.alpha, 'upstream');
	const oursData = loadEngineData(opt.ours, 'ours');
	const alphaData = loadEngineData(opt.alpha, 'upstream');

	const oursRev = 'local working tree';
	const alphaRev = gitRev(opt.alpha);

	if (!opt.quiet) {
		console.log(`ours     ${relative(REPO, opt.ours)}  (${oursRev})`);
		console.log(`upstream ${relative(REPO, opt.alpha)}  (${alphaRev})`);
		console.log(`${cases.length} cases x 2 engines x ${opt.repeats} seeds x ${opt.samples} samples`
			+ `  |  tol = max(${opt.tolAbs} bashin, ${opt.tolSigma}sigma)  |  jobs ${opt.jobs}`);
		console.log('');
	}

	// Build the full task list up front so every gain.ts process can run concurrently,
	// not just the two engines of a single case.
	const jobs = [];
	for (const kase of cases) {
		const horseFile = horseFileFor(kase);
		const horse = JSON.parse(readFileSync(horseFile, 'utf8'));
		kase._horse = horse;
		kase._horseFile = horseFile;
		kase._parity = checkDataParity(kase, horse, oursData, alphaData);
		for (let r = 0; r < opt.repeats; ++r) {
			// Distinct seed per (case, repeat); same seed given to both engines so the
			// corpus is reproducible, even though the two RNGs consume it differently.
			const seed = (opt.seed + hashString(kase.id) + r * 7919) >>> 0;
			for (const [engine, bin, cwd] of [['ours', oursBin, opt.ours], ['alpha', alphaBin, opt.alpha]]) {
				jobs.push({kase, engine, run: () => runGain({bin, cwd, horseFile, kase, samples: opt.samples, seed, timeout: opt.timeout})});
			}
		}
	}

	const t0 = Date.now();
	let finished = 0;
	const results = await pool(jobs.map(j => async () => {
		const r = await j.run();
		++finished;
		if (!opt.quiet && process.stderr.isTTY) {
			process.stderr.write(`\r  running ${finished}/${jobs.length} ...`);
		}
		return r;
	}), opt.jobs);
	if (!opt.quiet && process.stderr.isTTY) process.stderr.write('\r' + ' '.repeat(40) + '\r');

	// Fold results back per case/engine.
	const byCase = new Map();
	for (const kase of cases) byCase.set(kase.id, {kase, ours: [], alpha: [], errors: [], warnings: new Set()});
	jobs.forEach((j, i) => {
		const slot = byCase.get(j.kase.id), r = results[i];
		if (!r.ok) slot.errors.push(`[${j.engine}] ${r.error}${r.stderr ? ': ' + r.stderr.split('\n').slice(-3).join(' | ') : ''}`);
		else {
			slot[j.engine].push(...r.samples);
			for (const w of r.warnings ?? []) slot.warnings.add(`[${j.engine}] ${w}`);
		}
	});

	const report = [];
	for (const {kase, ours, alpha, errors, warnings} of byCase.values()) {
		const row = {
			id: kase.id, horse: kase.horse, course: kase.course, skills: kase.skills ?? [],
			dataClean: kase._parity.clean, dataNotes: kase._parity.notes,
			warnings: [...warnings], errors
		};
		if (errors.length || ours.length === 0 || alpha.length === 0) {
			row.verdict = 'ERROR';
			report.push(row);
			continue;
		}
		const o = summarize(ours), a = summarize(alpha);
		const delta = o.mean - a.mean;
		const se = Math.sqrt(o.se ** 2 + a.se ** 2);
		const tol = Math.max(opt.tolAbs, opt.tolSigma * se);
		row.ours = strip(o);
		row.alpha = strip(a);
		row.delta = delta;
		row.combinedSE = se;
		// when both engines are deterministic the SE collapses to ~0 and z explodes on float noise
		row.z = (o.sd < 1e-9 && a.sd < 1e-9) || se <= 0 ? 0 : delta / se;
		row.tolerance = tol;
		row.medianDelta = o.median - a.median;
		row.sdRatio = a.sd > 0 ? o.sd / a.sd : NaN;
		row.ks = ksStatistic(o.sorted, a.sorted);
		// Upstream's gain.ts seeds both of its solvers identically, so anything without a
		// random sample policy comes out the same every sample: sd collapses to 0. That makes
		// the sd ratio meaningless for those cases, and a zero *mean* on top of it means the
		// skill never fired at all — agreement there is vacuous, not coverage.
		row.deterministic = a.sd < 1e-9;
		row.noop = row.deterministic && Math.abs(a.mean) < 1e-9;
		row.verdict = verdictOf(delta, tol);
		report.push(row);
	}

	printReport(report, opt, {oursRev, alphaRev, elapsed: (Date.now() - t0) / 1000});

	if (opt.json) {
		mkdirSync(dirname(opt.json), {recursive: true});
		writeFileSync(opt.json, JSON.stringify({
			generated: new Date().toISOString(),
			config: {samples: opt.samples, repeats: opt.repeats, seed: opt.seed, tolAbs: opt.tolAbs, tolSigma: opt.tolSigma},
			engines: {ours: {path: relative(REPO, opt.ours), rev: oursRev}, alpha: {path: relative(REPO, opt.alpha), rev: alphaRev}},
			cases: report
		}, null, 2));
		if (!opt.quiet) console.log(`\nwrote ${relative(REPO, opt.json)}`);
	}

	const gated = report.filter(r => opt.strict || r.dataClean);
	const bad = gated.filter(r => r.verdict !== 'PASS');
	return bad.length === 0 ? 0 : 1;
}

function strip(s) { const {sorted, ...rest} = s; return rest; }

function gitRev(dir) {
	try {
		return execFileSync('git', ['-C', dir, 'log', '-1', '--format=%h %cs'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
	} catch { return 'unknown'; }
}

function hashString(s) {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < s.length; ++i) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
	return h % 100000;
}

function printReport(report, opt, meta) {
	const W = 30;
	if (!opt.quiet) {
		console.log(pad('case', W) + padL('ours', 9) + padL('alpha', 9) + padL('Δ', 9) + padL('z', 8) + padL('tol', 8) + padL('KS', 7) + '  verdict');
		console.log('-'.repeat(W + 9 * 3 + 8 + 8 + 7 + 10));
		for (const r of report) {
			if (r.verdict === 'ERROR') {
				console.log(pad(r.id, W) + padL('-', 9) + padL('-', 9) + padL('-', 9) + padL('-', 8) + padL('-', 8) + padL('-', 7) + '  ERROR');
				for (const e of r.errors) console.log('    ' + e);
				continue;
			}
			const flag = (r.dataClean ? '' : ' (data)') + (r.noop ? ' (no-op)' : '');
			console.log(
				pad(r.id, W)
				+ padL(r.ours.mean.toFixed(3), 9)
				+ padL(r.alpha.mean.toFixed(3), 9)
				+ padL(sign(r.delta), 9)
				+ padL(r.z.toFixed(2), 8)
				+ padL(r.tolerance.toFixed(3), 8)
				+ padL(r.ks.toFixed(2), 7)
				+ '  ' + r.verdict + flag
			);
		}
		console.log('');
	}

	const dirty = report.filter(r => !r.dataClean);
	if (dirty.length) {
		console.log('data-divergent cases (upstream and our data files disagree — not engine bugs):');
		for (const r of dirty) console.log(`  ${r.id}: ${r.dataNotes.join('; ')}`);
		console.log('');
	}

	const warned = report.filter(r => r.warnings.length);
	if (warned.length && !opt.quiet) {
		console.log('engine warnings:');
		for (const r of warned) for (const w of r.warnings) console.log(`  ${r.id}: ${w}`);
		console.log('');
	}

	// Spread is expected to differ: upstream's gain.ts seeds both solvers identically
	// (common random numbers), ours seeds them independently. That changes the variance
	// of the paired difference without changing its expectation, so report it separately.
	const withStats = report.filter(r => r.verdict !== 'ERROR');
	if (withStats.length) {
		// deterministic cases have sd(alpha) == 0, which would blow the ratio up to infinity
		const ratios = withStats.filter(r => !r.deterministic).map(r => r.sdRatio).filter(Number.isFinite).sort((a, b) => a - b);
		const absDeltas = withStats.map(r => Math.abs(r.delta)).sort((a, b) => a - b);
		if (ratios.length) {
			console.log(`spread ratio sd(ours)/sd(alpha) over ${ratios.length} randomised cases: median ${quantile(ratios, 0.5).toFixed(2)}`
				+ `  [${ratios[0].toFixed(2)} .. ${ratios[ratios.length - 1].toFixed(2)}]`);
		}
		console.log(`|Δ| across cases: median ${quantile(absDeltas, 0.5).toFixed(3)}  p90 ${quantile(absDeltas, 0.9).toFixed(3)}  max ${absDeltas[absDeltas.length-1].toFixed(3)} bashin`);
	}

	const noops = report.filter(r => r.noop);
	if (noops.length) {
		console.log(`no-op cases (skill never fired in either engine — agreement here is vacuous): ${noops.map(r => r.id).join(', ')}`);
		console.log('');
	}

	const gated = report.filter(r => opt.strict || r.dataClean);
	const pass = gated.filter(r => r.verdict === 'PASS').length;
	const fail = gated.filter(r => r.verdict === 'FAIL').length;
	const err = gated.filter(r => r.verdict === 'ERROR').length;
	console.log(`\n${pass} pass, ${fail} fail, ${err} error`
		+ (opt.strict ? '' : ` (${report.length - gated.length} excluded for data divergence)`)
		+ `  in ${meta.elapsed.toFixed(1)}s`);
}

main().then(code => process.exit(code)).catch(e => { console.error(e); process.exit(2); });
