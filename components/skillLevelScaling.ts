// Skill hint level -> effect magnitude coefficients.
//
// This used to live in uma-skill-tools/RaceSolverBuilder and was applied inside buildSkillData,
// so hint levels actually changed the simulation. The upstream engine (alpha123) has no
// equivalent, so hint levels no longer affect results -- but the skill list still shows the
// scaled magnitudes, which is a display concern and belongs on this side of the line anyway.
const _levelCoefs: Record<number, number[]> = {
	1:  [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.10],
	2:  [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.10],
	3:  [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.10],
	4:  [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.10],
	5:  [1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.10],
	27: [1.0, 1.01, 1.04, 1.07, 1.10, 1.13, 1.16, 1.19, 1.22, 1.25],
	31: [1.0, 1.02, 1.04, 1.06, 1.08, 1.10, 1.125, 1.15, 1.175, 1.20],
};
const _defaultCoefs = [1.0, 1.02, 1.04, 1.06, 1.08, 1.10, 1.12, 1.14, 1.16, 1.18];

export function levelScalingCoef(effectType: number, level: number): number {
	if (level <= 1) return 1.0;
	const coefs = _levelCoefs[effectType] || _defaultCoefs;
	return coefs[Math.min(level, coefs.length) - 1];
}
