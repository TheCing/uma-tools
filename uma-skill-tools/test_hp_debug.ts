/**
 * Test HP tracking in compare mode
 */

import { RaceSolverBuilder, Strategy, Aptitude } from './RaceSolverBuilder';
import { Mood } from './HorseTypes';
import { GroundCondition, Weather, Season, Time } from './RaceParameters';
import courseData from '../umalator-global/course_data.json';

// Test configuration
const course = courseData['10914'];

const builder = new RaceSolverBuilder(1)
	.seed(12345)
	.course(course)
	.ground(GroundCondition.Heavy)
	.weather(Weather.Rainy)
	.season(Season.Spring)
	.time(Time.Midday)
	.mode('compare')
	.horse({
		speed: 1200,
		stamina: 1200,
		power: 800,
		guts: 400,
		wisdom: 400,
		strategy: Strategy.Senkou,
		distanceAptitude: Aptitude.S,
		surfaceAptitude: Aptitude.A,
		strategyAptitude: Aptitude.A,
		mood: Mood.Great,
		motivation: 0
	});

console.log('Running simulation...');
console.log('Config: 1200 stamina, Senkou, 3200m Heavy ground, 400 guts\n');

const gen = builder.build();
let result = gen.next();
if (!result.done) {
	const solver = result.value;

	console.log('Initial HP:', solver.hp.maxHp?.toFixed(1) || 'N/A');
	console.log('HP Policy:', solver.hp.constructor.name);

	const dt = 1.0 / 60.0;
	while (solver.pos < course.distance) {
		solver.step(dt);
	}

	console.log('\nFinal HP:', solver.hp.hp?.toFixed(1) || 'N/A');
	console.log('HP died:', solver.hpDied);
	console.log('HP died position:', solver.hpDiedPosition?.toFixed(1) || 'N/A');
	console.log('Full spurt:', solver.fullSpurt);
}
