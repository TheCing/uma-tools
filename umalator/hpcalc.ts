import { CourseData, CourseHelpers, Phase } from '../uma-skill-tools/CourseData';
import type { HorseParameters } from '../uma-skill-tools/HorseTypes';
import type { RaceParameters } from '../uma-skill-tools/RaceParameters';
import { RaceSolver, RaceState, PositionKeepState, PosKeepMode } from '../uma-skill-tools/RaceSolver';
import { RaceSolverBuilder, Perspective, PartialRaceParameters } from '../uma-skill-tools/RaceSolverBuilder';
import { HpPolicy, GameHpPolicy } from '../uma-skill-tools/HpPolicy';
import { PRNG } from '../uma-skill-tools/Random';
import { GroundCondition } from '../uma-skill-tools/RaceParameters';

import { HorseState, uniqueSkillForUma } from '../components/HorseDefTypes';

import skillmeta from '../skill_meta.json';

class ForceFullSpurtHpPolicy implements HpPolicy {
	wrapped: GameHpPolicy
	balance: number
	wasFullSpurt: boolean
	downhillSave: number

	constructor(readonly forceSpurt: boolean, course: CourseData, ground: GroundCondition, rng: PRNG) {
		this.wrapped = new GameHpPolicy(course, ground, rng);
		this.balance = Infinity;
		this.wasFullSpurt = false;
		this.downhillSave = 0;
	}

	get hp() { return this.wrapped.hp; }
	get finalHp() { return this.forceSpurt ? Math.min(this.balance, this.wrapped.hp) : this.wrapped.hp; }

	init(horse: HorseParameters) { this.wrapped.init(horse); }

	tick(state: RaceState, dt: number) {
		if (state.isDownhillMode) {
			this.downhillSave += this.wrapped.hpPerSecond({...state, isDownhillMode: false}, state.currentSpeed) * dt -
				this.wrapped.hpPerSecond(state, state.currentSpeed) * dt;
		}
		this.wrapped.tick(state, dt);
	}

	hasRemainingHp() { return this.wrapped.hasRemainingHp(); }
	hpRatioRemaining() { return this.wrapped.hpRatioRemaining(); }
	recover(modifier: number) { this.wrapped.recover(modifier); }

	getLastSpurtPair(state: RaceState, maxSpeed: number, bts2: number) {
		const maxDist = this.wrapped.distance - CourseHelpers.phaseStart(this.wrapped.distance, 2);
		const s = (maxDist - 60) / maxSpeed;
		const lastleg = {
			phase: 2 as Phase,
			positionKeepState: PositionKeepState.None,
			leadCompetition: false,
			posKeepStrategy: state.posKeepStrategy
		};
		this.balance = this.wrapped.hp - this.wrapped.hpPerSecond(lastleg, maxSpeed) * s;
		this.wasFullSpurt = this.balance >= 0;
		if (this.forceSpurt) {
			return [-1, maxSpeed] as [number, number];
		} else {
			return this.wrapped.getLastSpurtPair(state, maxSpeed, bts2);
		}
	}
}

class CalcRequiredHpPolicy implements HpPolicy {
	wrapped: GameHpPolicy

	constructor(course: CourseData, ground: GroundCondition, rng: PRNG) {
		this.wrapped = new GameHpPolicy(course, ground, rng);
	}

	get hpUsed() { return -this.wrapped.hp; }

	init(horse: HorseParameters) {
		this.wrapped.init(horse);
		this.wrapped.hp = 0;
	}

	tick(state: RaceState, dt: number) { this.wrapped.tick(state, dt); }
	hasRemainingHp() { return true; }
	hpRatioRemaining() { return 1.0; }
	recover(modifier: number) { this.wrapped.recover(modifier); }

	getLastSpurtPair(state: RaceState, maxSpeed: number, _1: number) {
		const maxDist = this.wrapped.distance - CourseHelpers.phaseStart(this.wrapped.distance, 2);
		const s = (maxDist - 60) / maxSpeed;
		const lastleg = {
			phase: 2 as Phase,
			positionKeepState: PositionKeepState.None,
			leadCompetition: false,
			posKeepStrategy: state.posKeepStrategy
		};
		this.wrapped.hp -= this.wrapped.hpPerSecond(lastleg, maxSpeed) * s;
		return [-1, maxSpeed] as [number, number];
	}
}

export interface HpCalcResults {
	results: {
		remainingHp: number[]
		requiredHp: number[]
		downhillSave: number[]
	}
	runData: {
		nspurt: number
		minrun: any
		maxrun: any
		meanrun: any
		medianrun: any
	}
}

export function runHpCalc(
	nsamples: number,
	course: CourseData,
	racedef: RaceParameters,
	uma: HorseState,
	pacer: HorseState | null,
	options: any
): HpCalcResults {
	const b0 = new RaceSolverBuilder(nsamples)
		.seed(options.seed)
		.course(course)
		.ground(racedef.groundCondition)
		.weather(racedef.weather)
		.season(racedef.season)
		.time(racedef.time)
		.posKeepMode(options.posKeepMode || PosKeepMode.None)
		.mode('compare');

	if (racedef.orderRange != null) {
		b0.order(racedef.orderRange[0], racedef.orderRange[1])
		  .numUmas(racedef.numUmas);
	}

	const uma_ = uma.update('skills', sk => Array.from(sk.values())).toJS();
	b0.horse(uma_);

	if (options.skillWisdomCheck === false) {
		b0.skillWisdomCheck(false);
	}
	if (options.rushedKakari === false) {
		b0.rushedKakari(false);
	}
	if (options.competeFight !== undefined) {
		b0.competeFight(options.competeFight);
	}
	if (options.leadCompetition !== undefined) {
		b0.leadCompetition(options.leadCompetition);
	}
	if (options.laneMovement !== undefined) {
		b0.laneMovement(options.laneMovement);
	}
	if (options.duelingRates) {
		b0.duelingRates(options.duelingRates);
	}

	// Add skills
	const umaUniqueId = uniqueSkillForUma(uma.outfitId, uma.starCount);
	const skillActivations = new Map();
	uma_.skills.forEach(id => {
		const lv = id === umaUniqueId ? uma.uniqueLv : 1;
		const forcedPos = uma.forcedSkillPositions.get(id);
		if (forcedPos != null) {
			b0.addSkillAtPosition(id, forcedPos, Perspective.Self, undefined, lv);
		} else {
			b0.addSkill(id, Perspective.Self, undefined, undefined, lv);
		}
	});

	// Add debuff uma skills if provided
	if (pacer) {
		const pacer_ = pacer.update('skills', sk => Array.from(sk.values())).toJS();
		pacer_.skills.forEach(id => {
			const forcedPos = pacer.forcedSkillPositions.get(id);
			if (forcedPos != null) {
				b0.addSkillAtPosition(id, forcedPos, Perspective.Other);
			} else {
				b0.addSkill(id, Perspective.Other);
			}
		});
	}

	if (!CC_GLOBAL) b0.withAsiwotameru().withStaminaSyoubu();

	if (options.posKeepMode === PosKeepMode.Approximate) {
		b0.useDefaultPacer(true);
	} else if (options.posKeepMode === PosKeepMode.Virtual) {
		if (pacer) {
			b0.pacer(pacer);
		} else {
			b0.useDefaultPacer();
		}
	}

	// Fork for required HP calculation BEFORE adding skill callbacks,
	// so b1 doesn't inherit them and pollute the shared skillActivations map
	const b1 = b0.fork()
		.hpPolicyFactory((course, params, rng) => new CalcRequiredHpPolicy(course, params.groundCondition, rng));

	// Set main builder to use ForceFullSpurtHpPolicy
	b0.hpPolicyFactory((course, params, rng) =>
		new ForceFullSpurtHpPolicy(options.forceFullSpurt ?? false, course, params.groundCondition, rng));

	// Skill activation tracking (only on b0, not the forked b1)
	b0.onSkillActivate(function (s, id, persp) {
		if (persp == Perspective.Self && id != 'asitame' && id != 'staminasyoubu') {
			if (!skillActivations.has(id)) skillActivations.set(id, []);
			skillActivations.get(id).push([s.pos, -1]);
		}
	});
	b0.onSkillDeactivate(function (s, id, persp) {
		if (persp == Perspective.Self && id != 'asitame' && id != 'staminasyoubu') {
			const ar = skillActivations.get(id);
			const r = ar?.find(x => x[1] == -1);
			if (r != null) r[1] = Math.min(s.pos, course.distance);
		}
	});

	const g0 = b0.build(), g1 = b1.build();
	const remainingHp: number[] = [], requiredHp: number[] = [], downhillSave: number[] = [];
	let min = Infinity, max = -Infinity, estMean: number, estMedian: number;
	let bestMeanDiff = Infinity, bestMedianDiff = Infinity;
	let minrun: any, maxrun: any, meanrun: any, medianrun: any;
	let nspurt = 0;
	const sampleCutoff = Math.max(Math.floor(nsamples * 0.8), nsamples - 200);

	for (let i = 0; i < nsamples; ++i) {
		skillActivations.clear();
		const s0 = g0.next().value as RaceSolver;
		const data = {
			t: [[]] as number[][],
			p: [[]] as number[][],
			v: [[]] as number[][],
			hp: [[]] as number[][],
			sk: [null, null] as any[],
			sdly: 0,
			dh: 0
		};

		while (s0.pos < course.distance) {
			s0.step(1/15);
			data.t[0].push(s0.accumulatetime.t);
			data.p[0].push(s0.pos);
			data.v[0].push(s0.currentSpeed + (s0.modifiers.currentSpeed.acc + s0.modifiers.currentSpeed.err));
			data.hp[0].push((s0.hp as ForceFullSpurtHpPolicy).hp);
		}
		s0.cleanup();
		data.sdly = s0.startDelay;
		data.sk[0] = new Map(skillActivations);
		skillActivations.clear();

		const hpp = s0.hp as ForceFullSpurtHpPolicy;
		nspurt += +hpp.wasFullSpurt;
		downhillSave.push(hpp.downhillSave);
		const hp = hpp.finalHp;
		remainingHp.push(hp);

		if (hp < min) {
			min = hp;
			minrun = data;
		}
		if (hp > max) {
			max = hp;
			maxrun = data;
		}
		if (i == sampleCutoff) {
			remainingHp.sort((a, b) => a - b);
			estMean = remainingHp.reduce((a, b) => a + b) / remainingHp.length;
			const mid = Math.floor(remainingHp.length / 2);
			estMedian = mid > 0 && remainingHp.length % 2 == 0
				? (remainingHp[mid - 1] + remainingHp[mid]) / 2
				: remainingHp[mid];
		}
		if (i >= sampleCutoff) {
			const meanDiff = Math.abs(hp - estMean!), medianDiff = Math.abs(hp - estMedian!);
			if (meanDiff < bestMeanDiff) {
				bestMeanDiff = meanDiff;
				meanrun = data;
			}
			if (medianDiff < bestMedianDiff) {
				bestMedianDiff = medianDiff;
				medianrun = data;
			}
		}

		// Required HP calculation (parallel solver)
		const s1 = g1.next().value as RaceSolver;
		let pushedReqHp = false;
		while (s1.pos < course.distance) {
			s1.step(1/15);
			if (s1.isLastSpurt) {
				requiredHp.push((s1.hp as CalcRequiredHpPolicy).hpUsed);
				pushedReqHp = true;
				break;
			}
		}
		s1.cleanup();
		if (!pushedReqHp) {
			requiredHp.push((s1.hp as CalcRequiredHpPolicy).hpUsed);
		}
	}

	remainingHp.sort((a, b) => a - b);
	requiredHp.sort((a, b) => a - b);
	downhillSave.sort((a, b) => a - b);

	return {
		results: { remainingHp, requiredHp, downhillSave },
		runData: { nspurt, minrun, maxrun, meanrun, medianrun }
	};
}
