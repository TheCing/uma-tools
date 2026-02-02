# Race Mechanics Research: Stat Thresholds, Aptitudes, and Positioning

This document summarizes research into how various stat mechanics affect race simulation results (bashin differences) in the umalator.

## Table of Contents

1. [Course Stat Thresholds](#course-stat-thresholds)
2. [Mood Coefficient Impact](#mood-coefficient-impact)
3. [Aptitude Modifiers](#aptitude-modifiers)
4. [Position Keep Mechanics](#position-keep-mechanics)
5. [Other Hidden Stat Mechanics](#other-hidden-stat-mechanics)
6. [HP and Stamina Mechanics](#hp-and-stamina-mechanics)
7. [Race Phases and Skill Activation](#race-phases-and-skill-activation)
8. [Speed Stat Mechanics (Myth Busting)](#speed-stat-mechanics-myth-busting)
9. [Optimization Priority Summary](#optimization-priority-summary)
10. [Appendix: Testing Methodology](#appendix-testing-methodology)
11. [Appendix: Terminology](#appendix-terminology-code--global-english)

---

## Course Stat Thresholds

### What Are Course Stat Thresholds?

Some race courses reward umas who have high values in specific stats. If you've ever wondered why certain courses seem to favor high-stamina builds or why some players obsess over hitting "stat breakpoints"—this is why.

**The idea:** Each course can have 1-2 "threshold stats." If your uma's stat exceeds certain thresholds (300, 600, 900), they get a small speed bonus during the race. This bonus is applied to your speed stat before it's used in velocity calculations.

**Why it matters:** Crossing a threshold gives your uma a slight edge. However, the actual impact is small (~0.2 bashin per threshold crossed)—so don't sacrifice aptitudes or skills just to hit a threshold.

### How It Works

Each course has a `courseSetStatus` array that defines which stats provide a speed bonus. This data comes from the game and is stored in `course_data.json`.

**Example:** Tokyo Dirt 1600m (course ID 10611) has `courseSetStatus: [1, 2]` meaning Speed and Stamina.

### The Formula

From [`CourseData.ts:76-84`](../uma-skill-tools/CourseData.ts):

```typescript
export function courseSpeedModifier(
    course: CourseData,
    stats: Readonly<{speed: number, stamina: number, power: number, guts: number, wisdom: number}>
) {
    // Stats are capped at 901 for this calculation
    const statvalues = [0, stats.speed, stats.stamina, stats.power, stats.guts, stats.wisdom]
        .map(x => Math.min(x, 901));

    return 1 + course.courseSetStatus.map(
        stat => (1 + Math.floor(statvalues[stat] / 300.01)) * 0.05
    ).reduce((a,b) => a + b, 0) / Math.max(course.courseSetStatus.length, 1);
}
```

### Threshold Tiers

The formula `(1 + Math.floor(stat / 300.01)) * 0.05` creates discrete tiers:

| Tier | Stat Range (after mood) | Bonus per Threshold Stat |
|------|-------------------------|--------------------------|
| 1    | 0-300                   | 0.05 (5%)                |
| 2    | 301-600                 | 0.10 (10%)               |
| 3    | 601-900                 | 0.15 (15%)               |
| 4    | 901+ (capped)           | 0.20 (20%)               |

These bonuses are **averaged** across all threshold stats for the course, then applied as a **speed stat multiplier**.

### How It's Applied

From [`RaceSolverBuilder.ts:199-203`](../uma-skill-tools/RaceSolverBuilder.ts):

```typescript
export function buildAdjustedStats(baseStats: HorseParameters, course: CourseData, ground: GroundCondition) {
    const raceCourseModifier = CourseHelpers.courseSpeedModifier(course, baseStats);

    return Object.freeze({
        speed: Math.max(baseStats.speed * raceCourseModifier + GroundSpeedModifier[course.surface][ground], 1),
        // ... other stats
    });
}
```

### Impact on Velocity

The speed stat affects velocity through this formula (from [`RaceSolver.ts:37-41`](../uma-skill-tools/RaceSolver.ts)):

```typescript
function baseTargetSpeed(horse: HorseParameters, course: CourseData, phase: Phase) {
    return baseSpeed(course) * Speed.StrategyPhaseCoefficient[horse.strategy][phase] +
        +(phase == 2) * Math.sqrt(500.0 * horse.speed) *
        Speed.DistanceProficiencyModifier[horse.distanceAptitude] *
        0.002;
}
```

**Key insight:** The speed stat contribution uses a **square root**, so a 2.5% increase in speed stat only yields ~1.2% increase in speed contribution (√1.025 ≈ 1.012).

Additionally, the speed contribution is only a small additive component (~7% of total velocity), so:

> **A 2.5% speed stat modifier difference ≈ 0.15-0.2% actual velocity difference**

### Measured Impact

Testing on Tokyo Dirt 1600m with synced RNG:
- Crossing one threshold tier on one stat: **~0.2L average bashin difference**

---

## Mood Coefficient Impact

### The Problem

Stat thresholds are calculated **after** mood is applied, which shifts the effective breakpoints.

From [`RaceSolverBuilder.ts:182-196`](../uma-skill-tools/RaceSolverBuilder.ts):

```typescript
export function buildBaseStats(horseDesc: HorseDesc, mood: Mood) {
    const motivCoef = 1 + 0.02 * horseDesc.mood;

    return Object.freeze({
        speed: adjustOvercap(horseDesc.speed) * motivCoef,
        stamina: adjustOvercap(horseDesc.stamina) * motivCoef,
        // ... other stats
    });
}
```

### Mood Coefficients

| Mood | Coefficient |
|------|-------------|
| -2   | 0.96        |
| -1   | 0.98        |
| ±0   | 1.00        |
| +1   | 1.02        |
| +2   | 1.04        |

### Adjusted Threshold Breakpoints

With +2 mood (1.04 multiplier), the raw stat breakpoints shift:

| Tier | After Mood Range | Raw Stat Range (÷1.04) |
|------|------------------|------------------------|
| 1    | 0-300            | 0-288                  |
| 2    | 301-600          | 289-576                |
| 3    | 601-900          | 577-865                |
| 4    | 901+             | 866+                   |

### Example

With +2 mood, testing 600 vs 601 stamina:
- 600 × 1.04 = 624 → floor(624 / 300.01) = **2** (tier 3)
- 601 × 1.04 = 625.04 → floor(625.04 / 300.01) = **2** (tier 3)

**Both are in the same tier!** No bashin difference observed.

To see a tier difference at +2 mood, compare **576 vs 577** stamina instead.

---

## Aptitude Modifiers

### What Are Aptitude Modifiers?

Aptitudes (the letter grades like S, A, B, C) aren't just cosmetic—they directly multiply your uma's performance in races. Each aptitude type affects a different aspect of racing:

- **Distance Aptitude**: How fast you go in the final phase (speed contribution) and how quickly you accelerate
- **Surface Aptitude**: How quickly you accelerate on turf vs dirt
- **Strategy Aptitude**: How effective your Wit stat is (affects skill activation, position keeping, rushed chance, and more)

**Why this matters:** Aptitudes are among the **most impactful** factors in race performance. Dropping from A to B distance aptitude costs you ~3 bashin—that's 15× more impactful than crossing a stat threshold. Always prioritize matching aptitudes to the race conditions.

### Aptitude Values

Aptitudes are indexed as: S=0, A=1, B=2, C=3, D=4, E=5, F=6, G=7

### Distance Aptitude

**Speed Contribution Modifier** (from [`RaceSolver.ts:30`](../uma-skill-tools/RaceSolver.ts)):
```typescript
export const DistanceProficiencyModifier = Object.freeze([1.05, 1.0, 0.9, 0.8, 0.6, 0.4, 0.2, 0.1]);
//                                                         S     A    B    C    D    E    F    G
```

**Acceleration Modifier** (from [`RaceSolver.ts:61`](../uma-skill-tools/RaceSolver.ts)):
```typescript
export const DistanceProficiencyModifier = Object.freeze([1.0, 1.0, 1.0, 1.0, 1.0, 0.6, 0.5, 0.4]);
//                                                         S    A    B    C    D    E    F    G
```

Note: Acceleration only penalizes at E or worse.

### Surface Aptitude

**Acceleration Modifier** (from [`RaceSolver.ts:60`](../uma-skill-tools/RaceSolver.ts)):
```typescript
export const GroundTypeProficiencyModifier = Object.freeze([1.05, 1.0, 0.9, 0.8, 0.7, 0.5, 0.3, 0.1]);
//                                                           S     A    B    C    D    E    F    G
```

### Strategy Aptitude

**Wisdom Multiplier** (from [`RaceSolverBuilder.ts:42`](../uma-skill-tools/RaceSolverBuilder.ts)):
```typescript
const StrategyProficiencyModifier = Object.freeze([1.1, 1.0, 0.85, 0.75, 0.6, 0.4, 0.2, 0.1]);
//                                                  S    A    B     C     D    E    F    G
```

Applied at [`RaceSolverBuilder.ts:207`](../uma-skill-tools/RaceSolverBuilder.ts):
```typescript
wisdom: baseStats.wisdom * StrategyProficiencyModifier[baseStats.strategyAptitude],
```

### Summary Table

| Aptitude | Distance (Speed) | Distance (Accel) | Surface (Accel) | Strategy (Wisdom) |
|----------|------------------|------------------|-----------------|-------------------|
| **S**    | 1.05             | 1.0              | 1.05            | 1.10              |
| **A**    | 1.00             | 1.0              | 1.00            | 1.00              |
| **B**    | 0.90             | 1.0              | 0.90            | 0.85              |
| **C**    | 0.80             | 1.0              | 0.80            | 0.75              |
| **D**    | 0.60             | 1.0              | 0.70            | 0.60              |
| **E**    | 0.40             | 0.6              | 0.50            | 0.40              |

### Distance Aptitude Impact Calculation

The speed contribution formula:
```typescript
sqrt(500 * horse.speed) * distanceMod * 0.002
```

For 1200 speed (adjusted ~1435 after mood/course modifier), A distance aptitude:
- Speed contribution = sqrt(500 × 1435) × 1.0 × 0.002 = **1.69 m/s**

In last spurt, this appears twice, so total contribution ~3.38 m/s.

**Comparing aptitudes:**

| Aptitude | Speed Contribution | Diff from A | Last Spurt Diff |
|----------|-------------------|-------------|-----------------|
| S        | 1.78 m/s          | +0.09 m/s   | +0.17 m/s       |
| A        | 1.69 m/s          | —           | —               |
| B        | 1.52 m/s          | −0.17 m/s   | −0.34 m/s       |
| C        | 1.35 m/s          | −0.34 m/s   | −0.68 m/s       |

### Estimated Bashin Impact

For a 1600m race (~22 seconds in final leg):

| Comparison | Velocity Diff | Estimated Bashin |
|------------|---------------|------------------|
| S vs A     | 0.17 m/s      | **~1.5L**        |
| A vs B     | 0.34 m/s      | **~3.0L**        |
| B vs C     | 0.34 m/s      | **~3.0L**        |

---

## Position Keep Mechanics

### What is Position Keeping?

Position keeping is the AI behavior that controls how your uma maintains their position relative to other horses during sections 1-10 (roughly the first 40% of the race). It simulates realistic race pacing—jockeys don't sprint from the gate, they settle into positions based on their strategy.

**The core mechanic:** Your uma has a target position based on their running style:
- **Front Runners** try to take the lead and stay ahead
- **Non-front runners** (Pace Chaser, Late Surger, End Closer) maintain a specific distance behind the pack leader (the "pacemaker")

When your uma drifts too far from their expected position, position keeping kicks in:
- **Too far behind?** → Pace Up mode (speed boost to catch up)
- **Too far ahead?** → Pace Down mode (slow down to fall back)

**Why it matters:** Position keeping directly affects your stamina consumption and race positioning. Understanding it helps you:
- Predict when your uma will speed up or slow down
- Understand why skills that affect speed interact with position keeping
- Plan stamina budgets (Pace Down saves HP, Pace Up/Speed Up costs more)

### Wisdom-Based Checks

Strategy aptitude affects positioning through wisdom-based RNG checks.

From [`RaceSolver.ts:838-843`](../uma-skill-tools/RaceSolver.ts):

```typescript
// For Front Runners: Speed Up and Overtake states
speedUpOvertakeWitCheck(): boolean {
    return this.posKeepRng.random() < 0.2 * Math.log10(0.1 * this.horse.wisdom);
}

// For Non-Front Runners: Pace Up state
paceUpWitCheck(): boolean {
    return this.posKeepRng.random() < 0.15 * Math.log10(0.1 * this.horse.wisdom);
}
```

### Calculated Probabilities

For 1200 wisdom (+2 mood = 1248 base):

| Strategy Apt | Effective Wisdom | Speed Up/Overtake % | Pace Up % |
|--------------|------------------|---------------------|-----------|
| **S**        | 1373             | 42.8%               | 32.1%     |
| **A**        | 1248             | 41.9%               | 31.4%     |
| **B**        | 1061             | 40.5%               | 30.4%     |

**Impact:** ~1-2% probability difference per aptitude tier at high wisdom. More significant at lower wisdom values.

### Indirect Positioning Effects

Distance and surface aptitudes don't directly affect position keep checks, but they affect velocity/acceleration which indirectly impacts:

1. **Gap to pacer** - Slower velocity means falling further behind
2. **Threshold crossing** - When you enter/exit position keep states
3. **Gap closure speed** - How quickly Pace Up closes the distance

### Pace Up Mode

#### What is Pace Up?

Pace Up is the opposite of Pace Down—it activates when a non-front runner (Pace Chaser, Late Surger, End Closer) falls **too far behind** the pacemaker. Your uma speeds up to catch back up to where they should be.

**The core idea:** If the gap to the pacemaker exceeds the maximum threshold for your strategy, your uma has a chance to enter Pace Up mode and close the distance.

#### Why Does Pace Up Exist?

Without Pace Up, an uma who falls behind would never recover. Pace Up ensures:

1. **Pack cohesion**: Keeps the race competitive by preventing umas from falling hopelessly behind
2. **Realistic pacing**: Jockeys who fall behind make efforts to close the gap
3. **Strategy viability**: End Closers and Late Surgers who start slow can still catch up

#### How Pace Up Works

**Trigger conditions:**
1. Gap to pacemaker exceeds the maximum threshold for your strategy
2. Must pass a wisdom check (probability = 15% × log₁₀(Wit × 0.1))

**Effect:** Target speed × 1.04 (4% speed boost)

**Exit condition:** Gap to pacemaker drops below a random value between min and max threshold

#### Pace Up Probabilities by Wisdom

| Wisdom | Pace Up Chance |
|--------|----------------|
| 600    | 26.7%          |
| 900    | 29.4%          |
| 1200   | 31.4%          |
| 1500   | 32.7%          |

*Note: Higher wisdom = better chance of triggering Pace Up when needed*

### Pace Down Mode

#### What is Pace Down?

Pace Down is a **position keeping** behavior that affects non-front runners (Pace Chaser, Late Surger, End Closer) during the early and middle portions of a race (sections 1-10 out of 24).

**The core idea:** Each running strategy has an "expected" position relative to the pack leader (the "pacemaker"). If your uma gets *too close* to the pacemaker—closer than their strategy should allow—they'll slow down to fall back into their expected position.

Think of it this way:
- An **End Closer** (Oikomi) should be hanging back ~7.5+ meters behind the leader
- A **Late Surger** (Sashi) should be ~6.5+ meters behind
- A **Pace Chaser** (Senkou) should be ~3+ meters behind

If your uma surges ahead of these thresholds (maybe from a fast start or being pushed forward), they enter Pace Down mode: intentionally slowing down to return to their "correct" position in the pack.

#### Why Does This Happen?

Position keeping simulates realistic race pacing. In real horse racing, jockeys don't sprint from the gate—they settle into positions and conserve energy for the final push. Pace Down enforces this:

1. **Prevents early burnout**: Non-front runners aren't meant to lead early
2. **Conserves stamina**: The 40% HP reduction during Pace Down is actually beneficial
3. **Maintains pack formation**: Keeps the race dynamics realistic

#### Trigger Conditions

Pace Down activates when **both** conditions are met:

1. **Too close to pacemaker**: Your gap to the pack leader is less than the minimum threshold for your strategy
2. **No active speed skills**: Target speed or current speed skills will prevent Pace Down from triggering

From [`RaceSolver.ts:900-906`](../uma-skill-tools/RaceSolver.ts):
```typescript
else if (behind < this.posKeepMinThreshold) {
    if (this.activeTargetSpeedSkills.length == 0 && this.activeCurrentSpeedSkills.length == 0) {
        this.positionKeepState = PositionKeepState.PaceDown;
    }
}
```

#### Position Keep Thresholds by Strategy

Each strategy has minimum and maximum distance thresholds, scaled by course length:

From [`RaceSolver.ts:76-91`](../uma-skill-tools/RaceSolver.ts):
```typescript
const BaseMinimumThreshold = [0, 0, 3.0, 6.5, 7.5];  // [_, _, Senkou, Sashi, Oikomi]
const BaseMaximumThreshold = [0, 0, 5.0, 7.0, 8.0];

function courseFactor(distance: number) {
    return 0.0008 * (distance - 1000) + 1.0;
}
```

| Strategy | Base Min | Base Max | 1200m Thresholds | 2400m Thresholds | 3200m Thresholds |
|----------|----------|----------|------------------|------------------|------------------|
| **Pace Chaser** | 3.0 | 5.0 | 3.0 / 5.08m | 3.0 / 6.12m | 3.0 / 6.76m |
| **Late Surger** | 6.5 | 7.0 | 6.60 / 7.11m | 7.96 / 8.57m | 8.78 / 9.46m |
| **End Closer** | 7.5 | 8.0 | 7.62 / 8.13m | 9.18 / 9.79m | 10.14 / 10.82m |

*Note: Pace Chaser's minimum threshold stays constant (3.0m) regardless of course distance.*

#### What Happens During Pace Down

When Pace Down activates, your uma:

| Effect | Value | What It Means |
|--------|-------|---------------|
| **Slows down** | 0.915x target speed | 8.5% speed reduction to fall back into position |
| **Saves stamina** | 0.6x HP consumption | 40% less stamina drain—this is actually good! |
| **Decelerates gently** | -0.5 m/s² | Smoother slowdown than normal deceleration |
| **Hugs the rail** | Target lane 0.18 | Moves inside to save distance while slowing |

From [`RaceSolver.ts:1005-1006`](../uma-skill-tools/RaceSolver.ts):
```typescript
case PositionKeepState.PaceDown:
    this.posKeepSpeedCoef = 0.915;
```

From [`HpPolicy.ts:82-84`](../uma-skill-tools/HpPolicy.ts):
```typescript
if (state.positionKeepState === PositionKeepState.PaceDown) {
    modifier *= 0.6;
}
```

#### Exit Conditions

Pace Down ends when any of these occur:

1. **Distance traveled**: Your uma has moved one section length (distance/24)
2. **Gap restored**: The gap to pacemaker exceeds the exit threshold (random value between min and max)
3. **Speed skill activates**: Any target speed or current speed skill will immediately end Pace Down

```typescript
if (this.pos >= this.posKeepExitPosition) {
    // Exit: traveled far enough
}
else if (behind > this.posKeepExitDistance ||
         this.activeTargetSpeedSkills.length > 0 ||
         this.activeCurrentSpeedSkills.length > 0) {
    // Exit: gap increased or speed skill active
}
```

*Note: Debuffs do not exit Pace Down mode—only speed buffs affect it.*

#### Is Pace Down Good or Bad?

**It depends!** Pace Down is often *beneficial* because of the 40% stamina savings:

- **Good scenario**: Your End Closer gets pushed forward early, enters Pace Down, conserves stamina, then has more HP for the final spurt
- **Bad scenario**: Pace Down triggers right when you wanted to maintain position, and you lose ground you can't recover

#### Strategic Implications

1. **Stamina conservation**: The 0.6x HP modifier makes Pace Down valuable for preserving stamina for the spurt
2. **Skill timing matters**: Speed skills prevent/exit Pace Down—activating a green skill early might cost you stamina savings
3. **Strategy choice**: End Closers and Late Surgers have larger thresholds, so they're more likely to hit Pace Down if they start fast
4. **Course length**: Longer courses have larger thresholds (except Pace Chaser min), giving more room before Pace Down triggers

*Additional reference: [Uma Musume Race Mechanics](https://docs.google.com/document/d/15VzW9W2tXBBTibBRbZ8IVpW6HaMX8H0RP03kq6Az7Xg) by KuromiAK (JP server—some mechanics may differ)*

### Front Runner Position Keep Modes

Front Runners have their own position keeping behaviors—instead of maintaining distance *behind* a pacemaker, they try to *take and hold the lead*.

#### Speed Up Mode

**What it does:** When a Front Runner is in first place but another horse is too close behind, they speed up to widen the gap.

**Why it exists:** Simulates a jockey who sees competition closing in and pushes harder to maintain their lead.

**Trigger conditions:**
1. Uma is in 1st place
2. Gap to 2nd place is less than 4.5 meters
3. Must pass a wisdom check (probability = 20% × log₁₀(Wit × 0.1))

**Effect:** Target speed × 1.04 (4% speed boost)

**Exit condition:** Gap to 2nd place exceeds 4.5 meters

#### Overtake Mode

**What it does:** When a Front Runner falls behind another Front Runner, they speed up to reclaim the lead.

**Why it exists:** Front Runners are built to lead—if they're not in front among their own strategy, they need to fix that.

**Trigger conditions:**
1. Uma is not in 1st place among Front Runners
2. Must pass a wisdom check (probability = 20% × log₁₀(Wit × 0.1))

**Effect:** Target speed × 1.05 (5% speed boost—faster than Speed Up!)

**Exit condition:** Uma is 10 meters ahead of other Front Runners

#### Speed Up/Overtake Probabilities by Wisdom

| Wisdom | Speed Up / Overtake Chance |
|--------|---------------------------|
| 600    | 35.6%                     |
| 900    | 39.1%                     |
| 1200   | 41.9%                     |
| 1500   | 43.6%                     |

*Note: Front Runner position keep checks use a higher coefficient (0.20) than Pace Up (0.15), making them more reliable*

---

## Other Hidden Stat Mechanics

### Skill Activation Wisdom Check

#### What is the Wisdom Check?

Most skills don't activate 100% of the time—they require passing a **wisdom check** before the race even begins. If your uma fails this check, the skill simply won't activate at all during that race.

**Why it matters:** You can have the perfect skill loadout, but low wisdom means some skills might not fire when you need them. This is why Wit matters even for builds that don't rely on position keeping or downhill bonuses.

**The formula:**
```
Activation Chance = max(100 - 9000/Wit, 20) %
```

Notice the **20% floor**—even with terrible wisdom, skills still have at least a 20% chance to activate.

From [`RaceSolver.ts:1335-1341`](../uma-skill-tools/RaceSolver.ts):
```typescript
checkWisdomForSkill(skill: PendingSkill): boolean {
    let rngRoll = this.wisdomRollRng.random();
    let wisdomCheck = Math.max(100 - 9000/wisdom, 20) * 0.01;
    return rngRoll <= wisdomCheck;
}
```

| Wisdom | Activation Chance |
|--------|-------------------|
| 600    | 85.0%             |
| 900    | 90.0%             |
| 1200   | 92.5%             |
| 1500   | 94.0%             |

*Note: This check uses **base wisdom** (after mood, before strategy aptitude modifier). The check happens once per skill before the race starts.*

### Rushed (Kakari) State / Overexertion

#### What is Overexertion?

Overexertion (掛かり/Kakari in Japanese, "Rushed" in code) is when your uma loses control and runs faster than intended, burning through stamina at an alarming rate. It's like a horse that gets too excited and ignores the jockey's commands.

**Why it matters:** Overexertion is **devastating** to stamina:
- **HP consumption × 1.6** (60% more stamina drain!)
- Your uma may exhaust themselves before the final spurt
- Combined with other stamina-draining states (like Lead Competition), it can completely ruin a race

#### When Does It Happen?

The game rolls for Overexertion **before the race starts**. If your uma "fails" the check, they will enter the rushed state at some point during sections 2-9 (early to mid-race).

**Overexertion Chance Formula:**
```
RushedChance = (6.5 / log₁₀(Wit × 0.1 + 1))² %
```

| Wisdom | Overexertion Chance |
|--------|---------------------|
| 300    | 19.0%               |
| 600    | 13.3%               |
| 900    | 11.0%               |
| 1200   | 9.7%                |

**Key insight:** Higher wisdom = lower chance of losing control. This is one of the main reasons Wit is valuable—it keeps your uma disciplined.

#### What Happens During Overexertion?

When rushed, your uma:
1. **Burns stamina 60% faster** (HP consumption × 1.6)
2. **Ignores normal position keeping** and tries to move forward aggressively
3. **Auto-succeeds all position keep wisdom checks** (forces Speed Up/Overtake/Pace Up)

**Strategy behavior during Overexertion:**
- Front Runners → Enter Speed Up mode
- Pace Chasers → Act like Front Runners
- Late Surgers → 75% chance to act like Front Runners, 25% like Pace Chasers
- End Closers → 70% Front Runner, 20% Pace Chaser, 10% Late Surger

#### How to Reduce Overexertion

1. **Stack Wisdom** - Every point helps reduce the chance
2. **Self-Control skill (自制心)** - Reduces chance by flat 3%

From [`RaceSolver.ts:576-584`](../uma-skill-tools/RaceSolver.ts):
```typescript
initRushedState() {
    const wisdomStat = this.horse.wisdom;
    const rushedChance = Math.pow(6.5 / Math.log10(0.1 * wisdomStat + 1), 2) / 100;

    const hasSelfControl = this.pendingSkills.some(s => s.skillId === '202161');
    const finalRushedChance = Math.max(0, rushedChance - (hasSelfControl ? 0.03 : 0));
}
```

#### Recovery from Overexertion

Overexertion doesn't last forever:
- Every 3 seconds while rushed, there's a **55% chance** to snap out of it
- Maximum duration: **12 seconds** (forced recovery)
- Debuffs that worsen rushed state extend the timer by 5 seconds

### Downhill Mode

#### What is Downhill Mode?

Downhill Mode is a **wisdom-based bonus** that can activate when your uma is running downhill. A smart horse recognizes the slope and uses gravity to their advantage, gaining speed while conserving stamina.

**Why it matters:** Downhill Mode is one of the best things that can happen during a race:
- **+0.3 m/s target speed bonus** (free speed!)
- **HP consumption × 0.4** (60% stamina savings!)

This is why Wit is valuable on courses with significant downhill sections—it gives you a chance to get this powerful bonus.

#### How It Triggers

Every second while on a downhill slope (slope < -1%), your uma has a wisdom-based chance to enter Downhill Mode:

**Activation Chance = Wit × 0.04%**

| Wisdom | Downhill Mode Chance (per second) |
|--------|-----------------------------------|
| 600    | 24%                               |
| 900    | 36%                               |
| 1200   | 48%                               |
| 1500   | 60%                               |

From [`RaceSolver.ts:1228-1232`](../uma-skill-tools/RaceSolver.ts):
```typescript
downhillCheck(roll: number) {
    if (this.slopePer < 0 && roll < this.horse.wisdom * 0.0004) {
        this.isDownhillMode = true;
        // Grants +0.3 m/s target speed bonus while active
    }
}
```

#### Duration and Exit

Once active, Downhill Mode has a **20% chance per second** to end. It also ends when you leave the downhill section.

### Minimum Speed (Guts)

From [`RaceSolver.ts:512`](../uma-skill-tools/RaceSolver.ts):

```typescript
this.minSpeed = 0.85 * baseSpeed(this.course) + Math.sqrt(200.0 * this.horse.guts) * 0.001;
```

### Section Modifiers (Wisdom)

From [`RaceSolver.ts:525-529`](../uma-skill-tools/RaceSolver.ts):

```typescript
this.sectionModifier = Array.from({length: 24}, () => {
    const max = this.horse.wisdom / 5500.0 * Math.log10(this.horse.wisdom * 0.1);
    const factor = (max - 0.65 + this.wisdomRollRng.random() * 0.65) / 100.0;
    return baseSpeed(this.course) * factor;
});
```

Adds per-section speed variance based on wisdom.

---

## HP and Stamina Mechanics

### Understanding Stamina and HP

In Uma Musume, your Stamina stat converts into **HP** (Hit Points) at the start of each race. HP is the fuel that powers your uma through the race—run out, and you slow to a crawl.

**Why this matters:**
- Running too fast burns HP faster (velocity² relationship)
- Different race states modify HP consumption (Overexertion +60%, Pace Down -40%)
- If you run out of HP before the final spurt, you can't reach max speed
- Having enough HP for a **full spurt** (vs subpar spurt) can mean 2-5+ bashin difference

**The key question every build must answer:** Do I have enough stamina to sustain my target speed through the final spurt?

### Max HP Formula

From [`HpPolicy.ts:56`](../uma-skill-tools/HpPolicy.ts):

```typescript
this.maxHp = 0.8 * HpStrategyCoefficient[horse.strategy] * horse.stamina + this.distance;
```

### Strategy HP Coefficients

From [`HpPolicy.ts:26`](../uma-skill-tools/HpPolicy.ts):

```typescript
const HpStrategyCoefficient = Object.freeze([0, 0.95, 0.89, 1.0, 0.995, 0.86]);
//                                            -  Nige  Senk  Sashi  Oiko  Oonige
```

| Strategy | Coefficient | Relative HP |
|----------|-------------|-------------|
| Sashi (3) | 1.00 | Best |
| Oikomi (4) | 0.995 | -0.5% |
| Nige (1) | 0.95 | -5% |
| Senkou (2) | 0.89 | -11% |
| Oonige (5) | 0.86 | -14% |

**Example** (1200 stamina, 3200m course):

| Strategy | Max HP Calculation | Max HP |
|----------|-------------------|--------|
| Sashi | 0.8 × 1.0 × 1200 + 3200 | 4160 |
| Oikomi | 0.8 × 0.995 × 1200 + 3200 | 4155 |
| Nige | 0.8 × 0.95 × 1200 + 3200 | 4112 |
| Senkou | 0.8 × 0.89 × 1200 + 3200 | 4054 |
| Oonige | 0.8 × 0.86 × 1200 + 3200 | 4026 |

### HP Consumption Formula

From [`HpPolicy.ts:89-93`](../uma-skill-tools/HpPolicy.ts):

```typescript
hpPerSecond(state, velocity) {
    const gutsModifier = state.phase >= 2 ? this.gutsModifier : 1.0;
    return 20.0 * Math.pow(velocity - this.baseSpeed + 12.0, 2) / 144.0 *
        this.getStatusModifier(state) * this.groundModifier * gutsModifier;
}
```

**Key variables:**
- `baseSpeed` = 20.0 - (distance - 2000) / 1000
- `gutsModifier` = 1.0 + 200.0 / sqrt(600.0 × guts) — only in phase 2+
- `groundModifier` = 1.0 (Firm), 1.0 (Good), 1.02 (Soft/Heavy on turf)

### Guts HP Modifier

From [`HpPolicy.ts:58`](../uma-skill-tools/HpPolicy.ts):

```typescript
this.gutsModifier = 1.0 + 200.0 / Math.sqrt(600.0 * horse.guts);
```

| Guts | Modifier | Effect |
|------|----------|--------|
| 600 | 1.333 | +33% HP consumption in phase 2 |
| 800 | 1.289 | +29% |
| 1000 | 1.258 | +26% |
| 1200 | 1.236 | +24% |
| 1500 | 1.211 | +21% |

**Note:** Higher guts = lower modifier = less HP consumption. This is a significant factor for long races.

### HP Status Modifiers

From [`HpPolicy.ts:63-87`](../uma-skill-tools/HpPolicy.ts):

| State | Modifier | Effect |
|-------|----------|--------|
| Normal | 1.0 | — |
| Downhill Mode | 0.4 | -60% consumption |
| Pace Down | 0.6 | -40% consumption |
| Rushed (Kakari/Overexertion) | 1.6 | +60% consumption |
| Spot Struggle (Lead Competition) | 1.4 | +40% consumption |
| Spot Struggle + Rushed | 3.6 | +260% consumption |
| Breakaway Spot Struggle | 3.5 | +250% consumption |
| Breakaway Spot Struggle + Rushed | 7.7 | +670% consumption |

#### Lead Competition (Spot Struggle)

**What it is:** When multiple Front Runners are close together early in the race (sections 1-6), they enter a "Lead Competition" where they fight for the lead position.

**Why it matters:** Lead Competition is a **stamina trap** for Front Runners:
- HP consumption × 1.4 (40% extra drain)
- Combined with Overexertion → × 3.6 (260% extra drain!)
- For Breakaway strategy → × 3.5 (250% extra drain)

**Trigger conditions (Front Runners):**
- Distance gap < 3.75m
- Lane gap < 16.5% of course width
- Active between 150m from start to section 6

**Effects:**
- Target speed boost based on Guts: `+(500 × Guts)^0.6 × 0.0001 m/s`
- Duration based on Guts: `(700 × Guts)^0.5 × 0.012 seconds`

**Strategic implication:** Front Runner vs Front Runner races are stamina wars. The higher your Guts, the more speed you gain and the longer you can sustain the competition.

#### Dueling (Compete Fight)

**What it is:** When two umas are neck-and-neck on the final straight, they push each other harder—both gaining speed but burning more stamina.

**Why it matters:** Dueling can make or break a close finish. Both umas get a Guts-based speed boost, making high Guts valuable in competitive races.

**Trigger conditions:**
- On the final straight
- Distance gap < 3.0m, Lane gap < 25% of course width
- Must be maintained for > 2 seconds
- Must be in top 50% placement
- Speed gap < 0.6 m/s

**Effects:**
- Target speed boost: `+(200 × Guts)^0.708 × 0.0001 m/s`
- Acceleration boost: `+(160 × Guts)^0.59 × 0.0001 m/s²`

**Exit conditions:**
- HP drops below 15% → Can't start dueling
- HP drops below 5% → Dueling ends

*Note: Dueling is not simulated in the umalator (it only simulates one horse), but understanding it helps explain why Guts matters in competitive races.*

### Recovery Skills

Recovery skills (type 9) heal a percentage of max HP:
```typescript
recover(modifier: number) {
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * modifier);
}
```

**Common heal values** (modifier is in basis points, 10000 = 100%):

| Modifier | % Heal | Example Skills |
|----------|--------|----------------|
| 550 | 5.5% | Swinging Maestro, most gold heals |
| 750 | 7.5% | Stronger heals (Pure Heart, etc.) |
| 350 | 3.5% | Weaker heals |
| 150 | 1.5% | Minor heals |

### Full Spurt vs Subpar Spurt

The `getLastSpurtPair` function determines if a horse can sustain max spurt speed:

```typescript
if (this.hp >= hpNeeded) {
    return [-1, maxSpeed];  // Full spurt
}
// Otherwise, calculate subpar spurt speed...
```

**Impact on aptitude testing:**
- **Low stamina** → Subpar spurt → Both horses run slower → Smaller S vs A gap
- **High stamina** → Full spurt → Max speed achieved → Full aptitude difference realized

This is why Distance S vs A bashin difference **increases with stamina** — you need enough HP to actually utilize the higher speed from better aptitude.

### Estimating Stamina Requirements

Rough formula for HP needed on a course:

```
Phase 0+1 HP ≈ (distance × 2/3) / phase1_speed × phase1_consumption
Phase 2 HP ≈ (distance × 1/3) / spurt_speed × spurt_consumption × gutsModifier
Total ≈ Phase 0+1 + Phase 2
```

For accurate testing, ensure **100% full spurt rate** on both horses being compared.

---

## Race Phases and Skill Activation

### The Four Phases

The race is divided into **4 phases**, not 3. From [`CourseData.ts:3,58-74`](../uma-skill-tools/CourseData.ts):

```typescript
export type Phase = 0 | 1 | 2 | 3;

export function phaseStart(distance: number, phase: Phase) {
    switch (phase) {
    case 0: return 0;
    case 1: return distance * 1/6;
    case 2: return distance * 2/3;
    case 3: return distance * 5/6;
    }
}

export function phaseEnd(distance: number, phase: Phase) {
    switch (phase) {
    case 0: return distance * 1/6;
    case 1: return distance * 2/3;
    case 2: return distance * 5/6;
    case 3: return distance;
    }
}
```

| Phase | Name | Start | End | Description |
|-------|------|-------|-----|-------------|
| **0** | Opening | 0 | 1/6 | Start gate, initial positioning |
| **1** | Middle | 1/6 | 2/3 | Main body of the race |
| **2** | Final | 2/3 | 5/6 | Final push begins |
| **3** | Last Stretch | 5/6 | finish | Home stretch |

### Phase Positions by Course Distance

| Distance | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|----------|---------|---------|---------|---------|
| **1200m** | 0-200m | 200-800m | 800-1000m | 1000-1200m |
| **1600m** | 0-267m | 267-1067m | 1067-1333m | 1333-1600m |
| **2000m** | 0-333m | 333-1333m | 1333-1667m | 1667-2000m |
| **2400m** | 0-400m | 400-1600m | 1600-2000m | 2000-2400m |
| **3200m** | 0-533m | 533-2133m | 2133-2667m | 2667-3200m |

### Skill Condition: `phase_random`

The `phase_random` condition accepts values **0, 1, 2, or 3**:

```
phase_random==0  → Activates randomly within Phase 0 (Opening)
phase_random==1  → Activates randomly within Phase 1 (Middle)
phase_random==2  → Activates randomly within Phase 2 (Final)
phase_random==3  → Activates randomly within Phase 3 (Last Stretch)
```

**Important:** `phase_random==2` does NOT mean "last spurt" — it means the Final phase (2/3 to 5/6 of the course).

### Phase 2 vs Last Spurt

These are **different concepts** that often overlap but are not the same:

| Concept | Definition | When it starts |
|---------|------------|----------------|
| **Phase 2** | Fixed position: 2/3 of course distance | Always at same position |
| **Last Spurt** | HP-based state: max speed mode | Variable, depends on HP |

**Last Spurt** is triggered by the HP policy when the horse determines it can sustain maximum speed to the finish. This typically happens somewhere in Phase 2 or Phase 3, depending on:
- Remaining HP
- Distance to finish
- Horse's calculated spurt speed

### Phase 2 + Last Spurt Overlap on Sprints

On shorter courses, horses often enter Last Spurt almost immediately upon reaching Phase 2:

| Course | Phase 2 Length | Phase 3 Length | Total Final Phases | Typical Last Spurt Start |
|--------|----------------|----------------|-------------------|-------------------------|
| **1200m** | 200m | 200m | 400m | ~850-950m |
| **1600m** | 266m | 267m | 533m | ~1100-1200m |
| **2400m** | 400m | 400m | 800m | ~1800-2000m |
| **3200m** | 534m | 533m | 1067m | ~2400-2600m |

**Key insight:** On sprints (1200m), a `phase_random==2` skill only has a ~200m window, and horses often enter Last Spurt within that window. The "pre-spurt Phase 2" time on a 1200m sprint might be just a few seconds.

On longer courses, there's more separation between entering Phase 2 and entering Last Spurt.

### Related Skill Conditions

| Condition | Description |
|-----------|-------------|
| `phase==N` | Must be in phase N (not random activation) |
| `phase_random==N` | Random activation within phase N |
| `phase>=N` | Must be in phase N or later |
| `is_lastspurt==1` | Must be in Last Spurt state |
| `phase_firsthalf_random==N` | Random activation in first half of phase N |
| `phase_laterhalf_random==N` | Random activation in second half of phase N |

### Speed Stat and Phase Relationship

The speed stat contribution formula (`+(phase == 2) * ...` in baseTargetSpeed) uses **code phase 2**, which in the codebase check `phase == 2` only matches Phase 2 specifically.

However, in **Last Spurt**, the speed contribution appears twice in the formula regardless of phase number, so speed stat contributes fully during Last Spurt whether it occurs in Phase 2 or Phase 3.

---

## Speed Stat Mechanics (Myth Busting)

### The "Speed Caps at 1100" Myth

**Claim:** On sprint tracks (1200m), speed stat "caps at 1100" with no benefit beyond that value.

**Verdict:** **FALSE.** There is no speed cap in the code. Speed contributes via `√(500 × speed)` with diminishing returns, but always provides benefit.

### The Formulas

From [`RaceSolver.ts:33-49`](../uma-skill-tools/RaceSolver.ts):

**Base Course Speed:**
```typescript
function baseSpeed(course: CourseData) {
    return 20.0 - (course.distance - 2000) / 1000.0;
}
// For 1200m → 20.0 - (-800/1000) = 20.8 m/s
// For 2400m → 20.0 - (400/1000) = 19.6 m/s
```

**Phase 2 Target Speed:**
```typescript
function baseTargetSpeed(horse, course, phase) {
    return baseSpeed(course) * strategyCoef[phase] +
        +(phase == 2) * Math.sqrt(500.0 * horse.speed) * distanceAptMod * 0.002;
}
```

**Last Spurt Speed:**
```typescript
function lastSpurtSpeed(horse, course) {
    let v = (baseTargetSpeed(horse, course, 2) + 0.01 * baseSpeed(course)) * 1.05 +
        Math.sqrt(500.0 * horse.speed) * distanceAptMod * 0.002;
    v += Math.pow(450.0 * horse.guts, 0.597) * 0.0001;
    return v;
}
```

### Key Insights

1. **Speed stat only contributes in Phase 2 and Last Spurt** — Phases 0 and 1 use only base course speed × strategy coefficient
2. **The contribution uses a square root** — Diminishing returns, not a hard cap
3. **The sqrt term is additive** — It's added to a base velocity, not multiplied

### Actual Velocity Contribution

For S distance aptitude (modifier = 1.05):

| Speed | √(500×speed) | Velocity Bonus | Δ from prev |
|-------|--------------|----------------|-------------|
| 1000  | 707.1        | +1.485 m/s     | —           |
| 1100  | 741.6        | +1.557 m/s     | +0.072      |
| 1200  | 774.6        | +1.627 m/s     | +0.070      |
| 1300  | 806.2        | +1.693 m/s     | +0.066      |
| 1400  | 836.7        | +1.757 m/s     | +0.064      |
| 1500  | 866.0        | +1.819 m/s     | +0.062      |

**Each +100 speed ≈ +0.065-0.07 m/s velocity in final phase.**

In last spurt, the sqrt term appears twice in the formula, so the actual contribution is roughly double (~0.13 m/s per 100 speed).

### Why the Myth Might Exist

1. **Sprints have less final phase distance** — On 1200m, Phase 2+3 combined is only 400m (800m-1200m), with Phase 2 itself being just 200m (800m-1000m)
2. **Diminishing returns feel like a cap** — Going 1100→1200 gives less than 1000→1100
3. **Other factors matter more on sprints** — Power, guts, and acceleration are proportionally more important on short tracks
4. **Base speed is higher on sprints** — `20.8 m/s` vs `19.6 m/s` for long distance, so the speed stat's ~1.5 m/s contribution is a smaller percentage

### The Math: Why √(x) Creates "Soft Caps"

For any square root function y = √x:
- Elasticity = 0.5 (a 1% increase in x → 0.5% increase in y)
- A 10% increase in speed stat → ~5% increase in the speed contribution term

But since the speed contribution is only ~7-8% of total velocity:
- **A 10% speed stat boost → ~0.4% actual velocity boost**

This creates the *perception* of a cap where gains become imperceptible, but mathematically the gains never stop.

### Practical Implications

| Race Type | Speed Priority | Why |
|-----------|---------------|-----|
| Sprint (1000-1400m) | Lower | Short Phase 2, high base speed dilutes contribution |
| Mile (1600-1800m) | Medium | Balanced |
| Intermediate (2000-2400m) | Higher | Longer Phase 2 to utilize speed |
| Long (2500m+) | High | Maximum Phase 2 distance, but stamina often bottlenecks |

**Bottom line:** Speed stat has no cap. Every point helps, just with diminishing returns. On sprints, the marginal benefit is smaller due to shorter Phase 2 and higher base speed.

---

## Optimization Priority Summary

### Estimated Bashin Impact by Optimization

| Optimization                    | Typical Impact |
|---------------------------------|----------------|
| Distance aptitude S→A           | ~1.5L          |
| Distance aptitude A→B           | ~3.0L          |
| Good gold skill                 | 1-3L+          |
| Full spurt vs subpar            | 2-5L+          |
| Surface aptitude A→B            | ~0.5-1L        |
| Strategy aptitude A→B           | ~0.5L          |
| Skill activation timing         | 0.5-2L         |
| **Stat threshold (+1 tier)**    | **~0.2L**      |

### Key Takeaways

1. **Distance aptitude is massive.** A single tier drop (A→B) costs ~3L, which is 15× more impactful than crossing a stat threshold.

2. **Stat thresholds are low priority.** Crossing one tier on one stat yields only ~0.2L. Don't sacrifice skill slots, stamina safety, or aptitudes just to hit a threshold.

3. **Mood shifts threshold breakpoints.** With +2 mood, the tier 2→3 boundary is at raw stat 577, not 601. Always account for mood when testing thresholds.

4. **The 2.5% speed modifier ≠ 2.5% velocity.** Due to the square root in the formula and the additive nature of speed contribution, a 2.5% speed stat difference translates to only ~0.15-0.2% actual velocity difference.

5. **Strategy aptitude affects positioning.** Through wisdom-based position keep checks, but the impact is small (~1-2% probability per tier) at high wisdom.

6. **If near a threshold during training, grab it.** But don't go out of your way—the ROI compared to other optimizations isn't there.

---

## Appendix: Testing Methodology

All bashin measurements were taken using:
- **Sync RNG enabled** - Both umas face identical random events
- **Tokyo Dirt 1600m** (course ID 10611, `courseSetStatus: [1, 2]`)
- **+2 mood** unless otherwise specified
- **500+ samples** for statistical significance

To test threshold boundaries accurately:
1. Determine raw stat breakpoint: `threshold / motivCoef`
2. Compare stats on either side of the breakpoint
3. Ensure only the stat being tested differs between umas

---

## Appendix: Terminology (Code ↔ Global English)

This document uses internal code terminology. Here's how it maps to Global English localization:

### Running Styles (Strategy)

| Code Name | Global English | JP Romaji | Enum Value |
|-----------|----------------|-----------|------------|
| Nige | Front Runner | 逃げ | 1 |
| Senkou | Pace Chaser | 先行 | 2 |
| Sashi | Late Surger | 差し | 3 |
| Oikomi | End Closer | 追込 | 4 |
| Oonige | Breakaway | 大逃げ | 5 |

### Race Mechanics

| Code Name | Global English | Description |
|-----------|----------------|-------------|
| Lead Competition | Spot Struggle | Front runners competing for lead position |
| Compete Fight | Dueling | Non-front runners competing side-by-side |
| Rushed / Kakari | Overexertion | Horse running faster than intended, consuming extra HP |
| Position Keep | Pace Management | Automatic speed adjustments based on pack position |
| Pace Up | Speed Increase | Catching up when too far behind |
| Pace Down | Speed Decrease | Slowing down when too far ahead |
| Downhill Mode | Downhill Bonus | Wisdom-based speed bonus on downhill slopes |

### Stats

| Code Name | Global English | Notes |
|-----------|----------------|-------|
| wisdom | Wit | Sometimes called "Int" or "Intelligence" |
| guts | Guts | Same in both |
| bashin | Horse Length | 1 bashin = 2.5 meters |

### Ground Conditions

| Code Enum | Global English | JP |
|-----------|----------------|-----|
| `GroundCondition.Good` | Firm | 良 (best conditions) |
| `GroundCondition.Yielding` | Good | 稍重 |
| `GroundCondition.Soft` | Soft | 重 |
| `GroundCondition.Heavy` | Heavy | 不良 |

**⚠️ Warning:** The code enum `GroundCondition.Good` maps to "Firm" in Global, not "Good". This is a legacy naming issue.

### Mood

| Code Value | Global English | Effect |
|------------|----------------|--------|
| +2 | Great | ×1.04 stats |
| +1 | Good | ×1.02 stats |
| 0 | Normal | ×1.00 stats |
| -1 | Bad | ×0.98 stats |
| -2 | Terrible | ×0.96 stats |

### HP Policy Terms

| Code Term | Meaning |
|-----------|---------|
| Full Spurt | Horse has enough HP to maintain maximum spurt speed |
| Subpar Spurt | Insufficient HP, horse runs at reduced spurt speed |
| HP Died | Horse ran out of HP during race |
| Max HP | Total HP pool (stamina × strategy coef × 0.8 + distance) |

For complete terminology reference, see [JP-GLOBAL-TERMINOLOGY.md](JP-GLOBAL-TERMINOLOGY.md).
