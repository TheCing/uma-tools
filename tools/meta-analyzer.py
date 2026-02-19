#!/usr/bin/env python3
"""
Meta Skill Analyzer - Phase 1 Prototype
Identifies optimal skills for a given course/style/conditions
"""

import json
import re
import sys
import argparse
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from enum import IntEnum

class Strategy(IntEnum):
    NIGE = 1      # Front Runner / Front Runner
    SENKOU = 2    # Stalker/ Pace Chaser
    SASHI = 3     # Betweener / Late Surger
    OIKOMI = 4    # Chaser / End Closer

class DistanceType(IntEnum):
    SHORT = 1     # ~1400m
    MILE = 2      # ~1600m
    MEDIUM = 3    # ~2000m
    LONG = 4      # ~2500m

# Effect type mappings
EFFECT_TYPES = {
    1: 'Speed (stat)',
    9: 'RecoveryRate',
    21: 'CurrentSpeed',
    27: 'TargetSpeed',
    28: 'SpeedWithDecel',
    31: 'Accel',
}

# Bashin per unit modifier per second for each effect type
# CALIBRATED against actual simulation results (CM8 Oikomi):
#   Encroaching Shadow: 0.40 accel × 0.9s = 4.06 L → ~11.3 L per accel-second (last spurt)
#   LPSI (inherited): 0.20 accel × 2.4s = 3.52 L → ~7.3 L per accel-second (phase 2 corner)
#   Straightaway Spurt: 0.20 accel × 0.9s = 2.14 L → ~11.9 L per accel-second (last spurt)
# Base rate (before timing multipliers): ~3-4 L per accel-second
BASHIN_PER_UNIT = {
    31: 4.0,    # Accel - ~4 L per 0.1 m/s² per second (before timing multipliers)
    27: 2.0,    # TargetSpeed - ~2 L per 0.1 m/s per second
    21: 2.0,    # CurrentSpeed - similar to target
    28: 1.5,    # SpeedWithDecel - with natural decel
    9: 0.1,     # Recovery - HP recovery (situational value)
    1: 0.02,    # Speed stat - ~1.2 L for +60 speed
    2: 0.01,    # Stamina stat - marginal direct effect
    3: 0.015,   # Power stat - affects accel
    4: 0.01,    # Guts stat - affects exhausted speed
    5: 0.005,   # Wisdom stat - affects skill proc
}

@dataclass
class CourseInfo:
    course_id: str
    distance: int
    distance_type: int
    track_id: int
    surface: int  # 1=turf, 2=dirt
    turn: int     # 1=right, 2=left
    corners: List[dict]
    straights: List[dict]
    slopes: List[dict]

    @property
    def num_corners(self):
        return len(self.corners)

    @property
    def has_uphill_finish(self):
        """Check if there's an uphill near the finish"""
        for slope in self.slopes:
            if slope['slope'] > 0 and slope['start'] + slope['length'] > self.distance - 300:
                return True
        return False

    @property
    def final_straight_length(self):
        """Length of the final straight"""
        for s in self.straights:
            if s['end'] == self.distance:
                return s['end'] - s['start']
        return 0

    @property
    def final_corner_start(self):
        """Where does the final corner begin?"""
        if not self.corners:
            return self.distance
        last_corner = max(self.corners, key=lambda c: c['start'])
        return last_corner['start']

@dataclass
class RaceConditions:
    season: int      # 1=spring, 2=summer, 3=autumn, 4=winter
    ground: int      # 1=good, 2=yielding, 3=soft, 4=heavy
    weather: int     # 1=sunny, 2=cloudy, 3=rainy, 4=snowy

@dataclass
class SkillScore:
    skill_id: str
    name: str
    raw_score: float
    activation_reliability: float  # 0-1
    final_score: float
    effect_summary: str
    condition_summary: str
    notes: List[str]

def load_data(global_path: str = 'umalator-global'):
    """Load all necessary data files"""
    with open(f'{global_path}/course_data.json') as f:
        courses = json.load(f)
    with open(f'{global_path}/skill_data.json') as f:
        skills = json.load(f)
    with open(f'{global_path}/skill_meta.json') as f:
        skill_meta = json.load(f)
    with open(f'{global_path}/skillnames.json') as f:
        skillnames = json.load(f)
    return courses, skills, skill_meta, skillnames

def get_course_info(courses: dict, course_id: str) -> CourseInfo:
    """Extract course information"""
    c = courses[course_id]
    return CourseInfo(
        course_id=course_id,
        distance=c['distance'],
        distance_type=c['distanceType'],
        track_id=c['raceTrackId'],
        surface=c['surface'],
        turn=c['turn'],
        corners=c.get('corners', []),
        straights=c.get('straights', []),
        slopes=c.get('slopes', [])
    )

def phase_distances(distance: int) -> Tuple[int, int, int]:
    """Return phase boundaries for a given distance"""
    phase0_end = int(distance / 6)
    phase1_end = int(distance * 2 / 3)
    return (phase0_end, phase1_end, distance)

def can_condition_activate(condition: str, course: CourseInfo,
                           strategy: Strategy, conditions: RaceConditions) -> Tuple[float, List[str]]:
    """
    Check if a condition can activate on this course/setup.
    Returns (reliability 0-1, list of notes)
    """
    notes = []
    reliability = 1.0

    # Parse condition into tokens
    # Handle @ (OR) by taking best case
    or_parts = condition.split('@')
    best_reliability = 0.0
    best_notes = []

    for or_part in or_parts:
        part_reliability = 1.0
        part_notes = []

        and_parts = or_part.split('&')
        for token in and_parts:
            token = token.strip()
            if not token:
                continue

            # running_style check
            if 'running_style==' in token:
                req_style = int(token.split('==')[1])
                if req_style != strategy:
                    part_reliability = 0.0
                    part_notes.append(f'Wrong style (needs {req_style})')
                    break

            # distance_type check
            elif 'distance_type==' in token:
                req_dist = int(token.split('==')[1])
                if req_dist != course.distance_type:
                    part_reliability = 0.0
                    part_notes.append(f'Wrong distance type')
                    break

            # track_id check
            elif 'track_id==' in token:
                req_track = int(token.split('==')[1])
                if req_track != course.track_id:
                    part_reliability = 0.0
                    part_notes.append(f'Wrong track')
                    break

            # season check
            elif 'season==' in token:
                req_season = int(token.split('==')[1])
                if req_season != conditions.season and req_season != 5:  # 5 = any?
                    part_reliability = 0.0
                    part_notes.append(f'Wrong season')
                    break

            # ground_condition check (wet/dry conditions)
            elif 'ground_condition==' in token:
                req_ground = int(token.split('==')[1])
                if req_ground != conditions.ground:
                    part_reliability = 0.0
                    part_notes.append(f'Wrong ground')
                    break

            # ground_type check (turf vs dirt surface)
            elif 'ground_type==' in token:
                req_surface = int(token.split('==')[1])
                if req_surface != course.surface:
                    part_reliability = 0.0
                    surface_names = {1: 'turf', 2: 'dirt'}
                    part_notes.append(f'Needs {surface_names.get(req_surface, "unknown")} course')
                    break

            # corner requirements
            elif 'corner==' in token:
                req = token.split('==')[1]
                if req == '0':  # needs straight
                    if course.final_straight_length < 100:
                        part_reliability *= 0.5
                        part_notes.append('Short final straight')
                else:  # needs corner
                    if course.num_corners == 0:
                        part_reliability = 0.0
                        part_notes.append('No corners')
                        break

            elif 'corner!=' in token:
                req = token.split('!=')[1]
                if req == '0':  # needs to be on corner
                    if course.num_corners == 0:
                        part_reliability = 0.0
                        part_notes.append('No corners')
                        break

            # Phase checks
            elif 'phase>=' in token or 'phase==' in token:
                if 'phase>=2' in token or 'phase==2' in token:
                    part_notes.append('Late race (phase 2+)')
                elif 'phase>=1' in token or 'phase==1' in token:
                    pass  # Middle phase, neutral
                # phase 0 already handled elsewhere

            # Random activations
            elif 'phase_random==' in token:
                random_phase = int(token.split('==')[1])
                if random_phase == 2:
                    part_reliability *= 0.55  # Phase 2 random - decent proc rate
                    part_notes.append('Random (phase 2)')
                else:
                    part_reliability *= 0.5  # Random proc
                    part_notes.append('Random (phase)')

            elif 'corner_random==' in token:
                part_reliability *= 0.3  # Less reliable
                part_notes.append('Random (corner)')

            elif 'straight_random==' in token:
                part_reliability *= 0.4
                part_notes.append('Random (straight)')

            elif 'all_corner_random==' in token:
                part_reliability *= 0.25
                part_notes.append('Random (all corners)')

            # Position-based (assume strategy-appropriate position)
            elif 'order_rate>=' in token or 'order_rate<=' in token:
                # Oikomi typically in back, Nige in front, etc.
                if 'order_rate>=' in token:
                    threshold = int(token.split('>=')[1])
                    if strategy == Strategy.OIKOMI and threshold <= 70:
                        pass  # Oikomi will be in back
                    elif strategy == Strategy.NIGE and threshold >= 30:
                        part_reliability *= 0.3
                        part_notes.append('Position mismatch')
                elif 'order_rate<=' in token:
                    threshold = int(token.split('<=')[1])
                    if strategy == Strategy.NIGE and threshold >= 30:
                        pass  # Nige will be in front
                    elif strategy == Strategy.OIKOMI and threshold <= 40:
                        part_reliability *= 0.3
                        part_notes.append('Position mismatch')

            # is_lastspurt - depends on style
            elif 'is_lastspurt==' in token:
                if strategy in [Strategy.SASHI, Strategy.OIKOMI]:
                    part_notes.append('Last spurt skill')
                else:
                    part_reliability *= 0.7

            # is_finalcorner
            elif 'is_finalcorner==' in token:
                if course.num_corners > 0:
                    part_notes.append('Final corner skill')
                else:
                    part_reliability = 0.0
                    break

            # is_overtake - back runners overtake more
            elif 'is_overtake==' in token:
                if strategy in [Strategy.SASHI, Strategy.OIKOMI]:
                    part_reliability *= 0.8
                    part_notes.append('Needs overtake')
                else:
                    part_reliability *= 0.4
                    part_notes.append('Needs overtake (front runner)')

            # infront_near_lane_time - requires being blocked from front
            elif 'infront_near_lane_time>=' in token:
                # CALIBRATED: NSM max=7.19L, median=1.13L → ~16% effective proc rate
                # Being blocked depends heavily on race dynamics and lane movement
                if strategy in [Strategy.SASHI, Strategy.OIKOMI]:
                    part_reliability *= 0.16  # Back runners - still low proc rate
                    part_notes.append('Needs blocked (rare)')
                else:
                    part_reliability *= 0.05  # Front runners almost never blocked
                    part_notes.append('Needs blocked (very rare)')

            # blocked_side_continuetime - requires being blocked from side
            elif 'blocked_side_continuetime>=' in token:
                # Similar to infront blocking - depends on race dynamics
                if strategy in [Strategy.SASHI, Strategy.OIKOMI]:
                    part_reliability *= 0.20  # Back runners slightly more likely
                    part_notes.append('Needs side-blocked (rare)')
                else:
                    part_reliability *= 0.08  # Front runners rarely side-blocked
                    part_notes.append('Needs side-blocked (very rare)')

            # popularity - underdog condition, very situational
            elif 'popularity>=' in token:
                part_reliability *= 0.25  # Unreliable - depends on matchup
                part_notes.append('Needs underdog status')

        if part_reliability > best_reliability:
            best_reliability = part_reliability
            best_notes = part_notes

    return best_reliability, best_notes

def estimate_bashin_gain(etype: int, modifier: float, duration: float,
                         condition: str, course: CourseInfo, strategy: Strategy) -> float:
    """
    Estimate bashin gain from an effect based on simulation physics.

    Physics basis (from RaceSolver.ts):
    - TargetSpeed/CurrentSpeed: extra distance = modifier * duration (meters)
    - Accel: complex - affects how fast you reach target speed
    - Recovery: enables full spurt, prevents "death" (HP exhaustion)

    Returns estimated bashin gain (positive = good for uma)
    """
    bashin_rate = BASHIN_PER_UNIT.get(etype, 0.0)

    # Base calculation: modifier * duration * rate
    base_gain = abs(modifier) * duration * bashin_rate

    # Apply context multipliers based on when the skill activates
    is_lastspurt = 'is_lastspurt==1' in condition
    is_finalcorner = 'is_finalcorner==1' in condition
    is_phase2_plus = 'phase>=2' in condition or 'phase==2' in condition or 'phase_random==2' in condition
    is_phase2_corner = is_phase2_plus and 'corner!=0' in condition
    is_late_race = is_lastspurt or is_finalcorner or 'distance_rate>=66' in condition or is_phase2_plus

    if etype == 31:  # Accel
        # CALIBRATED multipliers based on simulation results:
        # - Last spurt accels: ~11 L per accel-second (Encroaching Shadow)
        # - Phase 2 corner: ~7.3 L per accel-second (LPSI)
        # Base rate is 4.0, so multipliers are:
        if is_lastspurt:
            base_gain *= 2.8  # 4.0 × 2.8 = 11.2 L per accel-second
        elif is_phase2_corner:
            base_gain *= 1.85  # 4.0 × 1.85 = 7.4 L per accel-second
        elif is_late_race:
            base_gain *= 1.5
        elif 'phase==0' in condition or 'phase==1' in condition:
            base_gain *= 0.4  # Early accel is less valuable

    elif etype in (27, 21):  # TargetSpeed, CurrentSpeed
        # Speed skills in last spurt are at max effectiveness
        if is_lastspurt:
            base_gain *= 1.5
        elif is_late_race:
            base_gain *= 1.2
        # Early game speed skills have capped value due to pace keeping
        elif 'phase==0' in condition:
            base_gain *= 0.3

    elif etype == 9:  # Recovery
        # Recovery value depends on distance (longer = more valuable)
        distance_mult = 1.0 + (course.distance - 1600) / 2000
        # Strategy matters - chasers need more stamina
        if strategy in (Strategy.SASHI, Strategy.OIKOMI):
            distance_mult *= 1.3
        base_gain = abs(modifier) * bashin_rate * distance_mult

    elif etype in (1, 2, 3, 4, 5):  # Stat boosts
        # Stat boosts are permanent but have diminishing returns
        # They don't scale with duration (instant effect)
        base_gain = abs(modifier) * bashin_rate

    return base_gain

def score_skill(skill_id: str, skill_data: dict, course: CourseInfo,
                strategy: Strategy, conditions: RaceConditions,
                skillnames: dict) -> Optional[SkillScore]:
    """Score a skill for the given setup using physics-based bashin estimation"""

    alts = skill_data.get('alternatives', [])
    if not alts:
        return None

    alt = alts[0]  # Primary alternative
    cond = alt.get('condition', '')
    effects = alt.get('effects', [])
    duration = alt.get('baseDuration', 0) / 10000

    # Check activation
    reliability, notes = can_condition_activate(cond, course, strategy, conditions)

    if reliability == 0:
        return None

    # Score effects using physics-based estimation
    raw_score = 0.0
    effect_parts = []

    for ef in effects:
        etype = ef.get('type')
        modifier = ef.get('modifier', 0) / 10000

        type_name = EFFECT_TYPES.get(etype, f'type{etype}')

        # Use physics-based bashin gain estimation
        effect_bashin = estimate_bashin_gain(etype, modifier, duration, cond, course, strategy)
        raw_score += effect_bashin

        if modifier > 0:
            effect_parts.append(f'+{modifier:.2f} {type_name}')
        else:
            effect_parts.append(f'{modifier:.2f} {type_name}')

    if duration > 0:
        effect_parts.append(f'{duration:.1f}s')

    # Get skill name
    name = skillnames.get(skill_id, [skill_id])[0]

    # Final score = estimated bashin gain * activation reliability
    final_score = raw_score * reliability

    return SkillScore(
        skill_id=skill_id,
        name=name,
        raw_score=raw_score,
        activation_reliability=reliability,
        final_score=final_score,
        effect_summary=' | '.join(effect_parts),
        condition_summary=cond[:60] + '...' if len(cond) > 60 else cond,
        notes=notes
    )

def analyze_meta(course_id: str, strategy: Strategy, conditions: RaceConditions,
                 data_path: str = 'umalator-global') -> List[SkillScore]:
    """Main analysis function"""

    courses, skills, skill_meta, skillnames = load_data(data_path)
    course = get_course_info(courses, course_id)

    print(f"\n{'='*60}")
    print(f"META ANALYSIS: {course_id}")
    print(f"{'='*60}")
    print(f"Distance: {course.distance}m ({['', 'Short', 'Mile', 'Medium', 'Long'][course.distance_type]})")
    print(f"Track: {course.track_id} | Corners: {course.num_corners} | Final straight: {course.final_straight_length}m")
    print(f"Strategy: {strategy.name}")
    print(f"Conditions: Season={conditions.season}, Ground={conditions.ground}, Weather={conditions.weather}")
    print(f"{'='*60}\n")

    # Score all skills
    scored = []
    for skill_id, skill_data in skills.items():
        # Skip original unique skills - these are character-specific and can't be inherited
        # Original uniques: 5-digit (10xxx, 11xxx) or 6-digit (10xxxx, 11xxxx)
        # Inherited versions start with 9 (90xxx, 900xxx) - these ARE usable by any uma
        if not skill_id.startswith('9'):
            if len(skill_id) == 5 and skill_id[:2] in ['10', '11']:
                continue  # e.g., 10141 Corazón (Satono Diamond's skill)
            if len(skill_id) == 6 and skill_id[:2] in ['10', '11']:
                continue  # e.g., 100271 LPSI (Agnes Tachyon's skill)

        score = score_skill(skill_id, skill_data, course, strategy, conditions, skillnames)
        if score and score.final_score > 0:
            scored.append(score)

    # Sort by final score
    scored.sort(key=lambda x: -x.final_score)

    return scored

def find_green_activators(course: CourseInfo, strategy: Strategy, conditions: RaceConditions,
                          skills: dict, skill_meta: dict, skillnames: dict) -> List[SkillScore]:
    """Find green skills that can activate on this course (potential Groundwork activators)"""
    activators = []

    for skill_id, skill_data in skills.items():
        # Green skills are typically rarity 1-2 (white/green)
        rarity = skill_data.get('rarity', 0)
        if rarity > 2:  # Skip gold and above
            continue

        # Skip inherited uniques
        if skill_id.startswith('9'):
            continue

        alts = skill_data.get('alternatives', [])
        if not alts:
            continue

        alt = alts[0]
        cond = alt.get('condition', '')

        # Check if can activate
        reliability, notes = can_condition_activate(cond, course, strategy, conditions)

        if reliability > 0:
            name = skillnames.get(skill_id, [skill_id])[0]
            # For activators, we care about reliability, not bashin gain
            activators.append(SkillScore(
                skill_id=skill_id,
                name=name,
                raw_score=reliability,
                activation_reliability=reliability,
                final_score=reliability,
                effect_summary=f"Rarity {rarity}",
                condition_summary=cond[:50] + '...' if len(cond) > 50 else cond,
                notes=notes
            ))

    # Sort by reliability
    activators.sort(key=lambda x: -x.activation_reliability)
    return activators

def analyze_nige_package(course_id: str, conditions: RaceConditions,
                         data_path: str = 'umalator-global'):
    """Analyze Nige package: Groundwork activators + flex slots assuming 1st place"""

    courses, skills, skill_meta, skillnames = load_data(data_path)
    course = get_course_info(courses, course_id)
    strategy = Strategy.NIGE

    print(f"\n{'='*60}")
    print(f"NIGE PACKAGE ANALYSIS: {course_id}")
    print(f"{'='*60}")
    print(f"Distance: {course.distance}m ({['', 'Short', 'Mile', 'Medium', 'Long'][course.distance_type]})")
    print(f"Track: {course.track_id} | Corners: {course.num_corners}")
    print(f"Conditions: Season={conditions.season}, Ground={conditions.ground}, Weather={conditions.weather}")
    print(f"{'='*60}\n")

    # Find Groundwork activators
    activators = find_green_activators(course, strategy, conditions, skills, skill_meta, skillnames)

    print("GROUNDWORK ACTIVATORS (Green skills that proc on this course):")
    print("-" * 80)
    guaranteed = [a for a in activators if a.activation_reliability >= 0.9]
    likely = [a for a in activators if 0.5 <= a.activation_reliability < 0.9]
    possible = [a for a in activators if 0.3 <= a.activation_reliability < 0.5]

    print(f"\nGuaranteed (90%+): {len(guaranteed)} skills")
    for a in guaranteed[:10]:
        print(f"  {a.name}: {a.condition_summary}")

    print(f"\nLikely (50-90%): {len(likely)} skills")
    for a in likely[:10]:
        print(f"  {a.name} ({a.activation_reliability:.0%}): {a.condition_summary}")

    print(f"\nPossible (30-50%): {len(possible)} skills")
    for a in possible[:5]:
        print(f"  {a.name} ({a.activation_reliability:.0%})")

    # Now analyze flex slots assuming 1st place is secured
    print(f"\n{'='*60}")
    print("FLEX SLOT OPTIONS (Assuming 1st place secured)")
    print("="*60)

    # Get regular analysis but boost order==1 skills
    results = analyze_meta(course_id, strategy, conditions, data_path)

    # Filter to accel skills for flex slots
    accel_results = [s for s in results if 'Accel' in s.effect_summary]

    print("\nTop Accel Skills for Flex Slots:")
    print("-" * 80)
    for i, s in enumerate(accel_results[:15], 1):
        print(f"{i:>2}. {s.name[:30]:<30} {s.final_score:>6.2f} L  {s.effect_summary[:30]}")
        if s.notes:
            print(f"    Notes: {', '.join(s.notes)}")

    return activators, results

def main():
    parser = argparse.ArgumentParser(description='Meta Skill Analyzer - Find optimal skills for course/style')
    parser.add_argument('-c', '--course', type=str, default='10506',
                        help='Course ID (default: 10506 = Nakayama 2500m)')
    parser.add_argument('-s', '--strategy', type=str, default='oikomi',
                        choices=['nige', 'senkou', 'sashi', 'oikomi'],
                        help='Running style (default: oikomi)')
    parser.add_argument('--season', type=int, default=4,
                        help='Season: 1=Spring, 2=Summer, 3=Autumn, 4=Winter (default: 4)')
    parser.add_argument('--ground', type=int, default=1,
                        help='Ground: 1=Firm, 2=Good, 3=Soft, 4=Heavy (default: 1)')
    parser.add_argument('--weather', type=int, default=1,
                        help='Weather: 1=Sunny, 2=Cloudy, 3=Rainy, 4=Snowy (default: 1)')
    parser.add_argument('-n', '--top', type=int, default=30,
                        help='Number of top skills to show (default: 30)')
    parser.add_argument('--accel-only', action='store_true',
                        help='Only show acceleration skills')
    parser.add_argument('--speed-only', action='store_true',
                        help='Only show speed skills')
    parser.add_argument('--recovery-only', action='store_true',
                        help='Only show recovery skills')
    parser.add_argument('--nige-package', action='store_true',
                        help='Analyze Nige package: Groundwork activators + flex slots')

    args = parser.parse_args()

    conditions = RaceConditions(season=args.season, ground=args.ground, weather=args.weather)

    # Special mode for Nige package analysis
    if args.nige_package:
        analyze_nige_package(args.course, conditions)
        return

    strategy_map = {
        'nige': Strategy.NIGE,
        'senkou': Strategy.SENKOU,
        'sashi': Strategy.SASHI,
        'oikomi': Strategy.OIKOMI
    }
    strategy = strategy_map[args.strategy]

    results = analyze_meta(args.course, strategy, conditions)

    # Filter by type if requested
    if args.accel_only:
        results = [s for s in results if 'Accel' in s.effect_summary]
    elif args.speed_only:
        results = [s for s in results if 'TargetSpeed' in s.effect_summary or 'CurrentSpeed' in s.effect_summary]
        results = [s for s in results if 'Accel' not in s.effect_summary]
    elif args.recovery_only:
        results = [s for s in results if 'Recovery' in s.effect_summary]

    print(f"TOP {args.top} SKILLS FOR THIS SETUP (Estimated Bashin Gain):")
    print("-" * 110)
    print(f"{'Rank':<5} {'Est. L':<10} {'Reliability':<12} {'Skill':<35} {'Effects':<35}")
    print("-" * 110)

    for i, s in enumerate(results[:args.top], 1):
        bashin_str = f"{s.final_score:.3f} L"
        print(f"{i:<5} {bashin_str:<10} {s.activation_reliability:<12.0%} {s.name[:34]:<35} {s.effect_summary[:34]:<35}")
        if s.notes:
            print(f"      {'Notes: ' + ', '.join(s.notes)}")

    print("\n" + "="*60)
    print("SKILL CATEGORIES")
    print("="*60)

    # Group by effect type
    accel_skills = [s for s in results if 'Accel' in s.effect_summary][:10]
    speed_skills = [s for s in results if 'TargetSpeed' in s.effect_summary and s not in accel_skills][:10]
    recovery_skills = [s for s in results if 'Recovery' in s.effect_summary][:10]

    print("\nTop Acceleration Skills:")
    for s in accel_skills[:5]:
        print(f"  {s.name}: {s.effect_summary} (score: {s.final_score:.2f})")

    print("\nTop Speed Skills:")
    for s in speed_skills[:5]:
        print(f"  {s.name}: {s.effect_summary} (score: {s.final_score:.2f})")

    print("\nTop Recovery Skills:")
    for s in recovery_skills[:5]:
        print(f"  {s.name}: {s.effect_summary} (score: {s.final_score:.2f})")

if __name__ == '__main__':
    main()
