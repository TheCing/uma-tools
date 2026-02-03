/**
 * v2 Experimental Layout - CONDENSED
 *
 * Goal: Fit essential UI in one viewport without scrolling
 *
 * Key changes from v1:
 * 1. Collapsible Uma panel (drawer instead of fixed sidebar)
 * 2. Compact inline controls (no tall runPane)
 * 3. Track + conditions in header area
 * 4. Results as overlay/modal, not inline
 */

import { h, render, Fragment } from "preact";
import { useState, useCallback, useEffect, useRef, useMemo } from "preact/hooks";
import { IntlProvider } from "preact-i18n";

// Simulation utilities
import {
  convertUmaStateForWorker,
  buildRaceParameters,
  buildSimulationOptions,
  getDefaultPacer,
} from "./simulation-utils";

import { RaceTrack, RegionDisplayType } from "../../components/RaceTrack";
import { RaceSummary } from "../../components/RaceSummary";
import { Language } from "../../components/Language";
import {
  CustomSelect,
  Dropdown,
  Button,
  Tooltip,
  Settings,
  Play,
  BarChart3,
  GitCompare,
  Sun,
  Moon,
  Hash,
  X,
  Palette,
  ArrowLeftRight,
  Dice5,
  Link,
  Shuffle,
  Check,
} from "./components";
import { Users, HelpCircle } from "lucide-react";
import { V2TrackSelect } from "./track-select";
import { CompactConditions } from "./conditions";
import { presets, DEFAULT_PRESET } from "./presets";
import { V2UmaPanel, UmaState, defaultUmaState, IntroVideo } from "./uma-panel";
import { TraineesTab } from "./trainees-tab";
import { V2ResultsPane, CompareResults, RaceSnapshot } from "./results-pane";
import { VelocityOverlay } from "./velocity-overlay";
import { TourProvider, TourOverlay } from "./tour";
import { PasswordGate } from "./PasswordGate";
import {
  loadSession,
  saveSession,
  loadPreferences,
  savePreferences,
} from "./storage";
import courseData from "../course_data.json";
import skillnames from "../skillnames.json";
import "./v2.css";
import "./tour/tour.css";

/**
 * Detect if a glyph renders as a "tofu" missing glyph rectangle.
 * Compares the rendered character against a known missing codepoint.
 */
function hasGlyph(char: string): boolean {
  if (typeof document === 'undefined') return true; // SSR fallback

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;

  canvas.width = 50;
  canvas.height = 50;
  ctx.font = '32px sans-serif';
  ctx.textBaseline = 'middle';

  // Render the test character
  ctx.clearRect(0, 0, 50, 50);
  ctx.fillText(char, 0, 25);
  const testData = ctx.getImageData(0, 0, 50, 50).data;

  // Render a known missing glyph (private use area character)
  ctx.clearRect(0, 0, 50, 50);
  ctx.fillText('\uFFFF', 0, 25);
  const missingData = ctx.getImageData(0, 0, 50, 50).data;

  // Compare pixel data - if they match, the glyph is missing
  let matchCount = 0;
  let totalPixels = 0;
  for (let i = 0; i < testData.length; i += 4) {
    if (testData[i + 3] > 0 || missingData[i + 3] > 0) {
      totalPixels++;
      if (Math.abs(testData[i] - missingData[i]) < 10 &&
          Math.abs(testData[i + 1] - missingData[i + 1]) < 10 &&
          Math.abs(testData[i + 2] - missingData[i + 2]) < 10 &&
          Math.abs(testData[i + 3] - missingData[i + 3]) < 10) {
        matchCount++;
      }
    }
  }

  // If >90% similar to missing glyph, consider it unsupported
  return totalPixels === 0 || (matchCount / totalPixels) < 0.9;
}

// Corner arrow with fallback: ⮌ (U+2B8C) -> ↩ (U+21A9)
const CORNER_ARROW = hasGlyph('⮌') ? '⮌' : '↩';

// Minimal strings for RaceTrack
const STRINGS = {
  racetrack: {
    thresholds: "Stat thresholds: ",
    none: "​",
    inner: " (inner)",
    outer: " (outer)",
    outin: " (outer→inner)",
    orientation: ["", "(clockwise)", "(counterclockwise)", "", "(straight)"],
    turf: "Turf",
    dirt: "Dirt",
    straight: "Straight →",
    corner: `Corner ${CORNER_ARROW}{{n}}`,
    uphill: "Uphill ↗",
    downhill: "Downhill ↘",
    phase0: "Opening leg",
    phase1: "Middle leg",
    phase2: "Final leg",
    phase3: "Last spurt",
    short: {
      straight: "→",
      corner: `${CORNER_ARROW}{{n}}`,
      uphill: "↗",
      downhill: "↘",
    },
  },
  tracknames: {},
  coursedesc: {
    one: "{{distance}}m{{inout}}",
    many: "{{surface}} {{distance}}m{{inout}}",
  },
  ui: {
    stats: ['None', 'Speed', 'Stamina', 'Power', 'Guts', 'Wit'],
    joiner: ', ',
  },
};

import tracknames from "../../uma-skill-tools/data/tracknames.json";
Object.keys(tracknames).forEach(
  (k) => (STRINGS["tracknames"][k] = tracknames[k][1]),
);

function App() {
  // Load saved state on mount
  const savedSession = useRef(loadSession());
  const savedPrefs = useRef(loadPreferences());

  // Course and conditions
  const [courseId, setCourseId] = useState(
    savedSession.current?.courseId ?? DEFAULT_PRESET.courseId,
  );
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(
    savedSession.current?.selectedPresetId ?? DEFAULT_PRESET.id,
  );
  const [ground, setGround] = useState(
    savedSession.current?.ground ?? DEFAULT_PRESET.ground,
  );
  const [weather, setWeather] = useState(
    savedSession.current?.weather ?? DEFAULT_PRESET.weather,
  );
  const [season, setSeason] = useState(
    savedSession.current?.season ?? DEFAULT_PRESET.season,
  );
  const [time, setTime] = useState(
    savedSession.current?.time ?? DEFAULT_PRESET.time,
  );

  // Preferences (persisted separately)
  const [darkMode, setDarkMode] = useState(savedPrefs.current.darkMode);
  const [classicGreen, setClassicGreen] = useState(savedPrefs.current.classicGreen);

  // Simulation settings
  const [samples, setSamples] = useState(savedSession.current?.samples ?? 500);
  const [mode, setMode] = useState<"compare" | "chart">(
    savedSession.current?.mode ?? "compare",
  );
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xFFFFFFFF));
  const [syncRng, setSyncRng] = useState(true);
  const [skillWisdomCheck, setSkillWisdomCheck] = useState(true);
  const [rushedKakari, setRushedKakari] = useState(true);
  const [leadCompetition, setLeadCompetition] = useState(false);
  const [competeFight, setCompeteFight] = useState(false);

  // Panel visibility
  const [umaDrawerOpen, setUmaDrawerOpen] = useState(false);
  const [activeUmaTab, setActiveUmaTab] = useState<1 | 2 | 'trainees'>(1);
  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);

  // Velocity overlay toggles
  const [showVelocityOverlay, setShowVelocityOverlay] = useState(true);
  const [showHpOverlay, setShowHpOverlay] = useState(false);

  // Which run to display (mean/median/min/max)
  const [displayRun, setDisplayRun] = useState<'mean' | 'median' | 'min' | 'max'>('median');

  // Intro video - shows once when first uma is selected
  const [showIntroVideo, setShowIntroVideo] = useState(false);
  const introVideoShownRef = useRef(false);

  // Simulation results
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<CompareResults | null>(null);

  // Simulation worker
  const worker = useMemo(() => {
    const w = new Worker(new URL('./simulator.worker.ts', import.meta.url), { type: 'module' });
    w.addEventListener('message', (e: MessageEvent) => {
      const { type, results: workerResults } = e.data;
      switch (type) {
        case 'compare':
          setResults(workerResults);
          break;
        case 'compare-complete':
          setIsRunning(false);
          break;
      }
    });
    w.addEventListener('error', (e) => {
      console.error('[V2] Worker error:', e);
      setIsRunning(false);
    });
    return w;
  }, []);

  // Uma 1 state
  const [uma1, setUma1] = useState<UmaState>(
    savedSession.current?.uma1 ?? defaultUmaState,
  );

  // Uma 2 state (for compare mode)
  const [uma2, setUma2] = useState<UmaState>(
    savedSession.current?.uma2 ?? defaultUmaState,
  );

  // ============================================
  // AUTO-SAVE EFFECTS
  // ============================================

  // Save session state (debounced)
  const saveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      saveSession({
        courseId,
        selectedPresetId,
        ground,
        weather,
        season,
        time,
        samples,
        mode,
        uma1,
        uma2,
      });
    }, 500); // Debounce 500ms
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [courseId, selectedPresetId, ground, weather, season, time, samples, mode, uma1, uma2]);

  // Save preferences immediately
  useEffect(() => {
    savePreferences({ darkMode, classicGreen });
  }, [darkMode, classicGreen]);

  // Note: Timeline drawer no longer auto-opens - user can open manually

  // ============================================
  // HANDLERS
  // ============================================

  // Handler to apply a preset
  const handlePresetSelect = useCallback((presetId: number | null) => {
    setSelectedPresetId(presetId);
    if (presetId !== null) {
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setCourseId(preset.courseId);
        setGround(preset.ground);
        setWeather(preset.weather);
        setSeason(preset.season);
        setTime(preset.time);
      }
    }
  }, []);

  const handleUma1Change = useCallback((updates: Partial<UmaState>) => {
    // Trigger intro video on first uma selection
    if (updates.outfitId && !introVideoShownRef.current) {
      introVideoShownRef.current = true;
      setShowIntroVideo(true);
    }
    setUma1((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleUma1Load = useCallback((state: UmaState) => {
    setUma1(state);
  }, []);

  const handleUma1Reset = useCallback(() => {
    setUma1(defaultUmaState);
  }, []);

  const handleUma2Change = useCallback((updates: Partial<UmaState>) => {
    setUma2((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleUma2Load = useCallback((state: UmaState) => {
    setUma2(state);
  }, []);

  const handleUma2Reset = useCallback(() => {
    setUma2(defaultUmaState);
  }, []);

  const handleResetAll = useCallback(() => {
    setUma1(defaultUmaState);
    setUma2(defaultUmaState);
  }, []);

  const handleSwapUmas = useCallback(() => {
    setUma1(uma2);
    setUma2(uma1);
  }, [uma1, uma2]);

  // Notification banner - persist dismissed state only in production
  const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const [showNotification, setShowNotification] = useState(() => isDev ? true : !savedPrefs.current.notificationDismissed);

  const dismissNotification = useCallback(() => {
    setShowNotification(false);
    if (!isDev) {
      savePreferences({ notificationDismissed: true });
    }
  }, [isDev]);

  // Run simulation via worker
  const handleRunSimulation = useCallback(() => {
    setIsRunning(true);
    setResults(null);

    const course = courseData[courseId];
    if (!course) {
      console.error('[V2] Course not found:', courseId);
      setIsRunning(false);
      return;
    }

    // Send simulation request to worker
    worker.postMessage({
      msg: 'compare',
      data: {
        nsamples: samples,
        course,
        racedef: buildRaceParameters(ground, weather, season, time),
        uma1: convertUmaStateForWorker(uma1),
        uma2: convertUmaStateForWorker(uma2),
        pacer: getDefaultPacer(),
        options: buildSimulationOptions({
          seed,
          syncRng,
          skillWisdomCheck,
          rushedKakari,
          leadCompetition,
          competeFight,
        })
      }
    });
  }, [courseId, samples, ground, weather, season, time, uma1, uma2, worker, seed, syncRng, skillWisdomCheck, rushedKakari, leadCompetition, competeFight]);

  // Get current snapshot based on displayRun selection
  const currentSnapshot = useMemo(() => {
    if (!results?.runData) return null;
    switch (displayRun) {
      case 'min': return results.runData.minrun;
      case 'max': return results.runData.maxrun;
      case 'mean': return results.runData.meanrun;
      case 'median': return results.runData.medianrun;
    }
  }, [results, displayRun]);

  // Extract skill activation regions from results for track visualization
  const skillRegions = useMemo(() => {
    if (!currentSnapshot) return [];

    const colors = [
      { stroke: '#2a77c5', fill: 'rgba(42, 119, 197, 0.3)' },  // Uma 1 - blue
      { stroke: '#c52a2a', fill: 'rgba(197, 42, 42, 0.3)' }    // Uma 2 - red
    ];

    const regions: any[] = [];
    const snapshot = currentSnapshot;

    // Process skill activations for both umas
    [0, 1].forEach((umaIndex) => {
      const skillMap = snapshot.sk[umaIndex];
      if (!skillMap || !(skillMap instanceof Map)) return;

      skillMap.forEach((activations: number[][], skillId: string) => {
        if (!activations || activations.length === 0) return;

        // Get skill name (fallback to ID if not found)
        const name = skillnames[skillId]?.[0] ?? skillId;

        activations.forEach((ar: number[]) => {
          if (!ar || ar.length < 2) return;
          regions.push({
            type: RegionDisplayType.Textbox,
            color: colors[umaIndex],
            text: name,
            skillId,
            umaIndex,
            regions: [{ start: ar[0], end: ar[1] !== -1 ? ar[1] : ar[0] + 100 }]
          });
        });
      });
    });

    return regions;
  }, [currentSnapshot]);

  // Binary search helper for finding index at position
  const binSearch = useCallback((arr: number[], target: number) => {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, Math.min(lo, arr.length - 1));
  }, []);

  // Mouse move handler for velocity/HP readout
  const handleMouseMove = useCallback((pct: number) => {
    const chartData = currentSnapshot;
    if (!chartData) return;

    const course = (courseData as any)[courseId];
    if (!course) return;

    const box = document.getElementById('rtMouseOverBox');
    if (box) box.style.display = 'block';

    const x = pct * course.distance;
    const i0 = binSearch(chartData.p[0], x);
    const i1 = binSearch(chartData.p[1], x);

    const safeI0 = Math.max(0, Math.min(i0, chartData.v[0].length - 1));
    const safeI1 = Math.max(0, Math.min(i1, chartData.v[1].length - 1));

    const hp0 = chartData.hp?.[0]?.[safeI0]?.toFixed(0) ?? 'N/A';
    const hp1 = chartData.hp?.[1]?.[safeI1]?.toFixed(0) ?? 'N/A';

    const v1El = document.getElementById('rtV1');
    const v2El = document.getElementById('rtV2');
    if (v1El) v1El.textContent = `${chartData.v[0][safeI0].toFixed(2)} m/s  t=${chartData.t[0][safeI0].toFixed(2)}s  (${hp0} hp)`;
    if (v2El) v2El.textContent = `${chartData.v[1][safeI1].toFixed(2)} m/s  t=${chartData.t[1][safeI1].toFixed(2)}s  (${hp1} hp)`;
  }, [currentSnapshot, courseId, binSearch]);

  const handleMouseLeave = useCallback(() => {
    const box = document.getElementById('rtMouseOverBox');
    if (box) box.style.display = 'none';
  }, []);

  return (
    // Hi if you found this by reading the source, congrats!
    <PasswordGate password="rugpull">
    <Language.Provider value="en-global">
      <TourProvider autoStart={true}>
        <IntlProvider definition={STRINGS}>
          <div
            id="app-v2"
            class={`${darkMode ? "" : "light"} ${classicGreen ? "classic-green" : ""} ${showNotification ? "v2-has-notification" : ""}`}
          >
          {/* NOTIFICATION BANNER */}
          {showNotification && (
            <div class="v2-notification">
              <p>
                Notice: This fork of the Umalator is brought to you by
                MooMooCord. Includes the best of both the original Umalator and
                VFCord's VFalator, in addition to a suite of new features. Also,
                cow.
              </p>
              <button
                class="v2-notification-close"
                onClick={dismissNotification}
              >
                ✕
              </button>
            </div>
          )}

          {/* HEADER BAR - Track selection + conditions + run */}
          <header class="v2-header">
            <div class="v2-header-left">
              <CustomSelect
                value={selectedPresetId}
                onChange={(val) => handlePresetSelect(val as number | null)}
                options={[
                  { value: null, label: "Custom" },
                  ...presets.map((p) => ({ value: p.id, label: p.name })),
                ]}
                className="v2-preset-select"
              />
              <V2TrackSelect
                courseid={courseId}
                setCourseid={(id) => {
                  setSelectedPresetId(null);
                  setCourseId(id);
                }}
              />
            </div>

            <div class="v2-header-center">
              <CompactConditions
                ground={ground}
                setGround={(v) => {
                  setSelectedPresetId(null);
                  setGround(v);
                }}
                weather={weather}
                setWeather={(v) => {
                  setSelectedPresetId(null);
                  setWeather(v);
                }}
                season={season}
                setSeason={(v) => {
                  setSelectedPresetId(null);
                  setSeason(v);
                }}
                time={time}
                setTime={(v) => {
                  setSelectedPresetId(null);
                  setTime(v);
                }}
              />
            </div>

            <div class="v2-header-right">
              <div class="v2-mode-toggle">
                <button
                  type="button"
                  class={mode === "compare" ? "active" : ""}
                  onClick={() => setMode("compare")}
                >
                  <GitCompare size={14} />
                  Compare
                </button>
                <button
                  type="button"
                  class={mode === "chart" ? "active" : ""}
                  onClick={() => setMode("chart")}
                >
                  <BarChart3 size={14} />
                  Chart
                </button>
              </div>
              <Button
                variant="primary"
                className="v2-run-btn"
                icon={<Play size={14} />}
                onClick={handleRunSimulation}
                disabled={isRunning}
              >
                {isRunning ? 'Running...' : 'RUN'}
              </Button>
              <Dropdown
                trigger={
                  <Button variant="secondary" className="v2-settings-btn">
                    <Settings size={16} />
                  </Button>
                }
                align="right"
                items={[
                  {
                    id: "samples",
                    label: `Samples: ${samples}`,
                    icon: <Hash size={16} />,
                    onClick: () => {
                      const val = prompt(
                        "Enter number of samples:",
                        String(samples),
                      );
                      if (val)
                        setSamples(
                          Math.max(1, Math.min(10000, parseInt(val) || 500)),
                        );
                    },
                  },
                  {
                    id: "seed",
                    label: `Seed: ${seed}`,
                    icon: <Dice5 size={16} />,
                    onClick: () => {
                      const val = prompt("Enter seed:", String(seed));
                      if (val) setSeed(parseInt(val) || 0);
                    },
                  },
                  {
                    id: "randomize-seed",
                    label: "Randomize Seed",
                    icon: <Shuffle size={16} />,
                    onClick: () => setSeed(Math.floor(Math.random() * 0xFFFFFFFF)),
                  },
                  { id: "divider-sim", label: "", divider: true },
                  {
                    id: "syncRng",
                    label: "Sync RNG",
                    icon: syncRng ? <Check size={16} /> : null,
                    onClick: () => setSyncRng(!syncRng),
                  },
                  {
                    id: "skillWisdomCheck",
                    label: "Skill Wit Check",
                    icon: skillWisdomCheck ? <Check size={16} /> : null,
                    onClick: () => setSkillWisdomCheck(!skillWisdomCheck),
                  },
                  {
                    id: "rushedKakari",
                    label: "Rushed / Kakari",
                    icon: rushedKakari ? <Check size={16} /> : null,
                    onClick: () => setRushedKakari(!rushedKakari),
                  },
                  {
                    id: "leadCompetition",
                    label: "Spot Struggle",
                    icon: leadCompetition ? <Check size={16} /> : null,
                    onClick: () => setLeadCompetition(!leadCompetition),
                  },
                  {
                    id: "competeFight",
                    label: "Dueling",
                    icon: competeFight ? <Check size={16} /> : null,
                    onClick: () => setCompeteFight(!competeFight),
                  },
                  { id: "divider-ui", label: "", divider: true },
                  {
                    id: "theme",
                    label: darkMode ? "Light Mode" : "Dark Mode",
                    icon: darkMode ? <Sun size={16} /> : <Moon size={16} />,
                    onClick: () => setDarkMode(!darkMode),
                  },
                  {
                    id: "accent",
                    label: classicGreen ? "Bright Green" : "Classic Green",
                    icon: <Palette size={16} />,
                    onClick: () => setClassicGreen(!classicGreen),
                  },
                  { id: "divider-link", label: "", divider: true },
                  {
                    id: "copy-link",
                    label: "Copy Link",
                    icon: <Link size={16} />,
                    onClick: () => {
                      // TODO: Implement URL state copying
                      navigator.clipboard.writeText(window.location.href);
                    },
                  },
                  {
                    id: "restart-tour",
                    label: "Restart Tour",
                    icon: <HelpCircle size={16} />,
                    onClick: () => {
                      savePreferences({ tourCompleted: false });
                      window.location.reload();
                    },
                  },
                ]}
              />
            </div>
          </header>

          {/* MAIN CONTENT - RaceTrack takes center stage */}
          <main class="v2-main">
            <div class="v2-track-container">
              <RaceTrack
                courseid={courseId}
                width={960}
                height={250}
                xOffset={20}
                yOffset={10}
                yExtra={15}
                mouseMove={handleMouseMove}
                mouseLeave={handleMouseLeave}
                regions={skillRegions}
              >
                {/* Velocity overlay renders inside the track SVG */}
                {showVelocityOverlay && currentSnapshot && (
                  <VelocityOverlay
                    data={currentSnapshot}
                    courseDistance={(courseData as any)[courseId]?.distance ?? 2000}
                    width={960}
                    height={250}
                    xOffset={20}
                    showHp={showHpOverlay}
                  />
                )}

                {/* Mouse-over readout box (same as v1) */}
                <g id="rtMouseOverBox" style="display:none">
                  <text id="rtV1" x="25" y="10" fill="#2a77c5" font-size="10px"></text>
                  <text id="rtV2" x="25" y="20" fill="#c52a2a" font-size="10px"></text>
                </g>
              </RaceTrack>

              {/* Velocity toggle controls below track */}
              {results && (
                <div class="v2-velocity-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={showVelocityOverlay}
                      onChange={(e) => setShowVelocityOverlay((e.target as HTMLInputElement).checked)}
                    />
                    Velocity
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showHpOverlay}
                      onChange={(e) => setShowHpOverlay((e.target as HTMLInputElement).checked)}
                    />
                    HP
                  </label>
                </div>
              )}
            </div>

            {/* RESULTS - Inline below track */}
            <V2ResultsPane
              results={results}
              isRunning={isRunning}
              courseId={courseId}
              onRunSimulation={handleRunSimulation}
              displayRun={displayRun}
              onDisplayRunChange={setDisplayRun}
            />
          </main>

          {/* UMA DRAWER - Slides in from left */}
          <aside class={`v2-uma-drawer ${umaDrawerOpen ? "open" : ""}`}>
            {/* Toggle tab attached to drawer edge */}
            <button
              class="v2-uma-toggle"
              onClick={() => setUmaDrawerOpen(!umaDrawerOpen)}
            >
              ▶ Uma
            </button>

            <div class="v2-drawer-header">
              <h2>Configure Uma</h2>
              <button onClick={() => setUmaDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Uma tabs */}
            <div class="v2-uma-tabs">
              <button
                type="button"
                class={activeUmaTab === 1 ? "active" : ""}
                onClick={() => setActiveUmaTab(1)}
              >
                Uma 1
              </button>
              {mode === "compare" && (
                <>
                  <Tooltip content="Swap Uma 1 and Uma 2" position="bottom">
                    <button
                      type="button"
                      class="v2-uma-swap"
                      onClick={handleSwapUmas}
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  </Tooltip>
                  <button
                    type="button"
                    class={activeUmaTab === 2 ? "active" : ""}
                    onClick={() => setActiveUmaTab(2)}
                  >
                    Uma 2
                  </button>
                </>
              )}
              <button
                type="button"
                class={`v2-uma-tab-trainees ${activeUmaTab === 'trainees' ? "active" : ""}`}
                onClick={() => setActiveUmaTab('trainees')}
              >
                <Users size={14} />
                Saved
              </button>
            </div>

            <div class="v2-drawer-content">
              {activeUmaTab === 1 && (
                <V2UmaPanel
                  state={uma1}
                  onChange={handleUma1Change}
                  onLoad={handleUma1Load}
                  onReset={handleUma1Reset}
                  onResetAll={handleResetAll}
                  title={mode === "compare" ? "Umamusume 1" : "Umamusume"}
                  courseDistance={(courseData as Record<string, { distance: number }>)[courseId]?.distance}
                />
              )}
              {mode === "compare" && activeUmaTab === 2 && (
                <V2UmaPanel
                  state={uma2}
                  onChange={handleUma2Change}
                  onLoad={handleUma2Load}
                  onReset={handleUma2Reset}
                  onResetAll={handleResetAll}
                  title="Umamusume 2"
                  courseDistance={(courseData as Record<string, { distance: number }>)[courseId]?.distance}
                />
              )}
              {activeUmaTab === 'trainees' && (
                <TraineesTab
                  onLoadToUma1={handleUma1Load}
                  onLoadToUma2={handleUma2Load}
                  currentMode={mode}
                  currentUma1={uma1}
                  currentUma2={uma2}
                />
              )}
            </div>
          </aside>

          {/* RACE SUMMARY DRAWER - Slides in from right */}
          <aside class={`v2-summary-drawer ${summaryDrawerOpen ? "open" : ""}`}>
            {/* Toggle tab attached to drawer edge */}
            <button
              class="v2-summary-toggle"
              onClick={() => setSummaryDrawerOpen(!summaryDrawerOpen)}
            >
              Timeline ◀
            </button>

            <div class="v2-drawer-header">
              <h2>Race Summary</h2>
              <button onClick={() => setSummaryDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div class="v2-drawer-content">
              {results?.runData?.medianrun ? (
                <RaceSummary
                  medianrun={results.runData.medianrun}
                  courseDistance={(courseData as any)[courseId]?.distance ?? 2000}
                  skillnames={skillnames}
                  result={results.results.length > 0
                    ? results.results[Math.floor(results.results.length / 2)]
                    : 0}
                />
              ) : (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 'var(--space-lg)' }}>
                  Run a simulation to see the race timeline
                </p>
              )}
            </div>
          </aside>

          {/* FOOTER */}
          <footer class="v2-footer">
            <p>
              Umalator is licensed under{" "}
              <a
                href="https://www.gnu.org/licenses/gpl-3.0.html"
                target="_blank"
                rel="noopener"
              >
                GPL-3.0
              </a>
              .&nbsp; Special thanks to the original authors of&nbsp;
              <a href="#" target="_blank" rel="noopener">
                JP Umalator
              </a>
              ,&nbsp;
              <a
                href="https://github.com/alpha123/uma-tools"
                target="_blank"
                rel="noopener"
              >
                pecan
              </a>
              ,&nbsp;
              <a
                href="https://github.com/kachi-dev/uma-tools"
                target="_blank"
                rel="noopener"
              >
                the VFalator team
              </a>
              ,&nbsp;and&nbsp;
              <a
                href="https://discord.gg/moomoocows"
                target="_blank"
                rel="noopener"
              >
                MooMooCord
              </a>
              .
            </p>
            <div class="v2-footer-links">
              <a
                href="https://github.com/TheCing/uma-tools"
                target="_blank"
                rel="noopener"
              >
                GitHub
              </a>
              &nbsp;|&nbsp;
              <a
                href="https://github.com/TheCing/uma-tools/issues"
                target="_blank"
                rel="noopener"
              >
                Feedback
              </a>
              &nbsp;|&nbsp;
              <a
                href="https://umalator.app/hp-calculator/"
                target="_blank"
                rel="noopener"
              >
                HP Calculator
              </a>
            </div>
          </footer>

          {/* Backdrop when drawer is open */}
          {umaDrawerOpen && (
            <div class="v2-backdrop" onClick={() => setUmaDrawerOpen(false)} />
          )}

          {/* Intro video - plays once on first uma selection */}
          {showIntroVideo && umaDrawerOpen && (
            <IntroVideo onClose={() => setShowIntroVideo(false)} />
          )}

          {/* Tour overlay - renders via portal */}
          <TourOverlay />
        </div>
      </IntlProvider>
      </TourProvider>
    </Language.Provider>
    </PasswordGate>
  );
}

render(<App />, document.getElementById("app")!);
