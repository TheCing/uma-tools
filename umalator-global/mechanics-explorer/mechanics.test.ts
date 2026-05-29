import test from 'tape';
import * as M from './mechanics';

// Synthetic adjusted horse: strategy=Senkou(2), distApt=S(0), surfApt=A(1).
const HORSE: M.MechHorse = {
	speed: 2000, stamina: 2000, power: 2000, guts: 2000, wisdom: 2000,
	strategy: 2, distanceAptitude: 0, surfaceAptitude: 1
};
const COURSE: M.MechCourse = { distance: 2000, surface: 1 }; // turf

function close(t: test.Test, actual: number, expected: number, eps = 1e-6, msg = '') {
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
	close(t, M.lastSpurtSpeed(HORSE, COURSE), 25.34865986, 1e-6);
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
	close(t, M.hpPerSecond(HORSE, COURSE, 1, 21.6, 2), 30.379017, 1e-4);
	// phase 0 has no guts modifier
	close(t, M.hpPerSecond(HORSE, COURSE, 1, 21.6, 0), 25.688889, 1e-4);
	t.end();
});
