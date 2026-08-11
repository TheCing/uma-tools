import { Option } from 'commander';
import { HorseParameters } from '../HorseTypes';
import { CourseData } from '../CourseData';
import { Region } from '../Region';
import { Rule30CARng } from '../Random';
import { SkillRarity, PendingSkill, RaceSolver } from '../RaceSolver';
import { NoopHpPolicy } from '../HpPolicy';
import { ImmediatePolicy, RandomPolicy } from '../ActivationSamplePolicy';
import { SkillData, ToolCLI, PacerProvider, parseAptitude } from './ToolCLI';

const defaultThresholds = [0.5,1.0,1.5,2.0,2.5];

const cli = new ToolCLI();
cli.options(program => {
	program
		.addOption(new Option('-N, --nsamples <N>', 'number of random samples to use for skills with random conditions')
			.default(500)
			.argParser(x => parseInt(x,10))
		)
		.option('--seed <seed>', 'seed value for pseudorandom number generator', (value,_) => parseInt(value,10) >>> 0)
		.option('--enable-wisdom-checks', 'base skill activation on random checks dependent on wisdom')
		.addOption(new Option('-D, --distance-aptitude <letter>', 'compare with a different distance aptitude from the value in the horse definition')
			.choices(['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'])
			.argParser(a => parseAptitude(a, 'distance'))
		)
		.addOption(new Option('-S, --surface-aptitude <letter>', 'compare with a different surface aptitude from the value in the horse definition')
			.choices(['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'])
			.argParser(a => parseAptitude(a, 'surface'))
		)
		.addOption(new Option('--thresholds <cutoffs>', 'comma-separated list of values; print the percentage of the time they are exceeded')
			.default(defaultThresholds, defaultThresholds.join(','))
			.argParser(t => t.split(',').map(parseFloat))
		)
		.option('--dump', 'instead of printing a summary, dump data. intended to be piped into histogram.py.')
		.option('--csv [first_col]', 'print data as a CSV row (intended for batch scripting)');
});
cli.run((horse: HorseParameters, course: CourseData, defSkills: SkillData[], cliSkills: SkillData[], getPacer: PacerProvider, cliOptions: any) => {
	const nsamples = cliOptions.nsamples;
	const triggers = [];
	const seed = ('seed' in cliOptions ? cliOptions.seed : Math.floor(Math.random() * (-1 >>> 0))) >>> 0;
	const rng = new Rule30CARng(seed);

	// TODO bugged since this will be affected by strategy aptitude—will be fixed once we ditch this mess and use
	// RaceSolverBuilder for gain.ts
	const skillActivationChance = cliOptions.enableWisdomChecks ? Math.max(100.0 - 9000.0 / horse.wisdom) / 100.0 : 1.0;

	function addTriggers(sd: SkillData) {
		triggers.push(sd.samplePolicy.sample(sd.regions, nsamples, rng));
	}

	const debuffs = [];
	for (let i = cliSkills.length; --i >= 0;) {
		const ef = cliSkills[i].effects;
		if (ef.some(e => e.modifier < 0)) {
			const debuffEffects = [];
			debuffs.push(Object.assign({}, cliSkills[i], {effects: debuffEffects}));
			for (let j = ef.length; --j >= 0;) {
				if (ef[j].modifier < 0) {
					debuffEffects.push(ef[j]);
					ef.splice(j,1);
				}
			}
			if (ef.length == 0) {
				cliSkills.splice(i,1);
			}
		}
	}

	defSkills.forEach(addTriggers);
	cliSkills.forEach(addTriggers);
	debuffs.forEach(addTriggers);

	// Position keep is inert unless the solver is in a position keep mode AND has a pacemaker to
	// hold position against (see RaceSolver#applyPositionKeepStates). This tool supplied neither,
	// so it had no way to model pace down at all even though the web simulator defaults to
	// PosKeepMode.Approximate — CLI gains are measured against a different race from the one
	// users see in the app.
	//
	// --pos-keep-mode now wires both, but it still defaults to none, because turning it on
	// exposes a separate defect: 110391 (a +3500 TargetSpeed skill) measures -1.06 bashin on
	// senkou/Nakayama 2000m with approximate position keep, where it is +1.63 without. Pace down
	// exits on activeTargetSpeedSkills.length > 0, so a velocity skill should *shorten* pace down
	// and gain time, not lose it. Until that is understood, defaulting this on would silently
	// corrupt skill valuations.
	const solverPosKeep = {posKeepMode: cliOptions.posKeepMode, mode: 'compare'};

	// Mirrors what umalator/compare.ts does; with exactly one pacemaker the reference never
	// changes, so it can be resolved once instead of every tick.
	function attachPacer(solver: RaceSolver, pacer: RaceSolver | null) {
		if (pacer == null) return null;
		solver.initUmas([pacer]);
		pacer.initUmas([solver]);
		solver.updatePacer(pacer);
		return pacer;
	}

	function addSkill(skills: PendingSkill[], sd: SkillData, triggers: Region[], i: number) {
		skills.push({
			skillId: sd.skillId,
			rarity: sd.rarity,
			trigger: triggers[i % triggers.length],
			extraCondition: sd.extraCondition,
			effects: sd.effects
		});
	}

	let testHorse = horse;
	if (cliOptions.distanceAptitude != undefined) {
		testHorse = Object.freeze(Object.assign({}, testHorse, {distanceAptitude: cliOptions.distanceAptitude}));
	}
	if (cliOptions.surfaceAptitude != undefined) {
		testHorse = Object.freeze(Object.assign({}, testHorse, {surfaceAptitude: cliOptions.surfaceAptitude}));
	}

	// NB. if --distance-aptitude or --surface-aptitude are specified the pacer will still have the default aptitudes even when pacing the
	// modified aptitude version.
	// i'm not really sure if that's the expected thing to do or not, but it makes sense (imo)

	const gain = [];
	let min = Infinity, max = 0,
	    minconf = {i: 0, iterSeed: 0},
	    maxconf = {i: 0, iterSeed: 0};
	const dt = cliOptions.timestep;
	for (let i = 0; i < nsamples; ++i) {
		// Common random numbers. Both solvers for this sample are driven by identical
		// randomness, so everything that isn't the skill under test — start delay, gate roll,
		// kakari/rushed, downhill mode, wisdom rolls — cancels exactly in the difference
		// instead of adding noise to it (and, because the comparison is asymmetric — s2 only
		// runs until s's elapsed time — biasing it).
		//
		// Reseeding per iteration rather than sharing one long-lived pair of generators (as
		// upstream does) means the two solvers cannot drift out of lockstep when they consume
		// different amounts of randomness, which ours do: the two runs hold different skill
		// sets and RaceSolver draws from `rng` mid-race.
		const iterSeed = rng.int32();
		const checkRng = new Rule30CARng(iterSeed);
		const skillCheckRolls = [];
		for (let i = 0; i < defSkills.length + cliSkills.length + debuffs.length; ++i) {
			skillCheckRolls.push(checkRng.random());
		}
		const solverSeed = checkRng.int32();
		const solverRng1 = new Rule30CARng(solverSeed);
		const solverRng2 = new Rule30CARng(solverSeed);
		const pacerSeed = checkRng.int32();
		const pacerRng1 = new Rule30CARng(pacerSeed);
		const pacerRng2 = new Rule30CARng(pacerSeed);

		function wisdomCheck(sd: SkillData, i: number) {
			return sd.rarity == SkillRarity.Unique || skillCheckRolls[i] <= skillActivationChance;
		}

		const skills1 = [];
		defSkills.filter(wisdomCheck).forEach((sd,sdi) => addSkill(skills1, sd, triggers[sdi], i));
		cliSkills
			.filter((sd,sdi) => wisdomCheck(sd, sdi + defSkills.length))
			.forEach((sd,sdi) => addSkill(skills1, sd, triggers[sdi + defSkills.length], i));
		const s = new RaceSolver({horse: testHorse, course, hp: NoopHpPolicy, skills: skills1, rng: solverRng1, ...solverPosKeep});
		const pacer1 = attachPacer(s, getPacer(pacerRng1));

		while (s.pos < course.distance) {
			if (pacer1 != null && pacer1.pos < course.distance) pacer1.step(dt);
			s.step(dt);
		}

		const skills2 = [];
		defSkills.filter(wisdomCheck).forEach((sd,sdi) => addSkill(skills2, sd, triggers[sdi], i));
		debuffs
			.filter((sd,sdi) => wisdomCheck(sd, sdi + defSkills.length + cliSkills.length))
			.forEach((sd,sdi) => addSkill(skills2, sd, triggers[sdi + defSkills.length + cliSkills.length], i));
		const s2 = new RaceSolver({horse, course, hp: NoopHpPolicy, skills: skills2, rng: solverRng2, ...solverPosKeep});
		const pacer2 = attachPacer(s2, getPacer(pacerRng2));
		while (s2.accumulatetime.t < s.accumulatetime.t) {
			if (pacer2 != null && pacer2.pos < course.distance) pacer2.step(dt);
			s2.step(dt);
		}
		const diff = (s.pos - s2.pos) / 2.5;
		gain.push(diff);
		if (diff < min) {
			min = diff;
			minconf.i = i;
			minconf.iterSeed = iterSeed;
		}
		if (diff > max) {
			max = diff;
			maxconf.i = i;
			maxconf.iterSeed = iterSeed;
		}

	}
	gain.sort((a,b) => a - b);

	if (cliOptions.dump) {
		console.log(JSON.stringify(gain));
		return;
	}

	const mid = Math.floor(gain.length / 2);
	const median = (gain.length % 2 == 0 ? (gain[mid-1] + gain[mid]) / 2 : gain[mid]);
	const mean = (gain.reduce((a,b) => a + b) / gain.length);

	if (cliOptions.csv) {
		const cols = [min.toFixed(2), max.toFixed(2), median.toFixed(2), mean.toFixed(2)];
		cliOptions.thresholds.forEach(n => {
			cols.push((gain.reduce((a,b) => a + +(b >= n), 0) / gain.length * 100).toFixed(2) + '%');
		});
		if (typeof cliOptions.csv == 'string') {
			cols.unshift(cliOptions.csv);
		}
		cols.push(cliSkills.map(sd => {
			const p = sd.samplePolicy;
			return p == ImmediatePolicy ? 'ImmediatePolicy' : p == RandomPolicy ? 'RandomPolicy' : p.constructor.name;
		}).join(';'));
		console.log(cols.join(','));
	} else {
		console.log('min:\t' + min.toFixed(2));
		console.log('max:\t' + max.toFixed(2));
		console.log('median:\t' + median.toFixed(2));
		console.log('mean:\t' + mean.toFixed(2));

		if (cliOptions.thresholds.length > 0) {
			console.log('');
		}
		cliOptions.thresholds.forEach(n => {
		    console.log('≥' + n.toFixed(2) + ' | ' + (gain.reduce((a,b) => a + +(b >= n), 0) / gain.length * 100).toFixed(2) + '%');
		});

		console.log('');
		console.log('seed: ' + seed);

		console.log('');

		const conf = Buffer.alloc(4 * 4);
		const conf32 = new Int32Array(conf.buffer);
		conf32[0] = seed;
		conf32[1] = nsamples;
		conf32[2] = minconf.i;
		conf32[3] = minconf.iterSeed;
		console.log('min configuration: ' + conf.toString('base64'))
		conf32[2] = maxconf.i;
		conf32[3] = maxconf.iterSeed;
		console.log('max configuration: ' + conf.toString('base64'));
	}
});
