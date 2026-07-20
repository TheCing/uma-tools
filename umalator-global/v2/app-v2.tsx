/**
 * Moomoolator v2 - Modern Uma Musume Race Simulator
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

declare const CC_DEV: boolean;

import { h, render, Fragment } from "preact";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "preact/hooks";
import { IntlProvider } from "preact-i18n";

// Simulation utilities
import {
  convertUmaStateForWorker,
  buildRaceParameters,
  buildSimulationOptions,
  getDefaultPacer,
} from "./simulation-utils";

// Skill chart utilities
import {
  getActivateableSkills,
  getBaseSkillsToTest,
} from "./skill-chart-utils";

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
  GitCompare,
  Zap,
  X,
  ArrowLeftRight,
  Link,
} from "./components";
import { NotificationBanner } from "./components/NotificationBanner";
import {
  Users,
  HelpCircle,
  MessageSquare,
  Minus,
  Plus,
  Menu,
  Calculator,
  Book,
  Calendar,
  Heart,
  LayoutGrid,
} from "lucide-react";
import { V2TrackSelect } from "./track-select";
import { CompactConditions } from "./conditions";
import { presets, visiblePresets, DEFAULT_PRESET } from "./presets";
import { V2UmaPanel, UmaState, defaultUmaState } from "./uma-panel";
import { TraineesTab } from "./trainees-tab";
import { UmasTab, UmasTabState, initialUmasTabState } from "./roster/umas-tab";
import { V2ResultsPane, CompareResults, RaceSnapshot } from "./results-pane";
import { VelocityOverlay } from "./velocity-overlay";
import { TourProvider, TourOverlay } from "./tour";
import { SkillChartPane } from "./skill-chart-pane";
import { SkillChartDetail } from "./skill-chart-detail";
import { StaCalcResults } from "./stacalc";
// import { PasswordGate } from "./PasswordGate";
import { FeedbackDrawer } from "./feedback-drawer";
import { SimulationSettings } from "./sim-settings";
import { MobileNav, MobileView } from "./mobile-nav";
import {
  loadSession,
  saveSession,
  loadPreferences,
  savePreferences,
  copyShareableUrl,
  deserializeStateFromHash,
  COLOR_PALETTES,
  type ColorPalette,
} from "./storage";
import courseData from "../course_data.json";
import skillnames from "../skillnames.json";
import skillmeta from "../../skill_meta.json";
import "./v2.css";
import "./tour/tour.css";

// Discord webhook for feedback submissions - configure via VITE_DISCORD_WEBHOOK environment variable
const DISCORD_FEEDBACK_WEBHOOK = import.meta.env.VITE_DISCORD_WEBHOOK || '';

// Feedback drawer feature flag. Defaults to enabled. Set VITE_ENABLE_FEEDBACK=false in
// .env.local (or the build environment) to hide the drawer + floating toggle entirely.
// Also auto-hides when no webhook URL is configured — submission would fail anyway.
const FEEDBACK_ENABLED =
  import.meta.env.VITE_ENABLE_FEEDBACK !== 'false' &&
  DISCORD_FEEDBACK_WEBHOOK !== '';

/**
 * Detect if a glyph renders as a "tofu" missing glyph rectangle.
 * Compares the rendered character against a known missing codepoint.
 */
function hasGlyph(char: string): boolean {
  if (typeof document === "undefined") return true; // SSR fallback

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true;

  canvas.width = 50;
  canvas.height = 50;
  ctx.font = "32px sans-serif";
  ctx.textBaseline = "middle";

  // Render the test character
  ctx.clearRect(0, 0, 50, 50);
  ctx.fillText(char, 0, 25);
  const testData = ctx.getImageData(0, 0, 50, 50).data;

  // Render a known missing glyph (private use area character)
  ctx.clearRect(0, 0, 50, 50);
  ctx.fillText("\uFFFF", 0, 25);
  const missingData = ctx.getImageData(0, 0, 50, 50).data;

  // Compare pixel data - if they match, the glyph is missing
  let matchCount = 0;
  let totalPixels = 0;
  for (let i = 0; i < testData.length; i += 4) {
    if (testData[i + 3] > 0 || missingData[i + 3] > 0) {
      totalPixels++;
      if (
        Math.abs(testData[i] - missingData[i]) < 10 &&
        Math.abs(testData[i + 1] - missingData[i + 1]) < 10 &&
        Math.abs(testData[i + 2] - missingData[i + 2]) < 10 &&
        Math.abs(testData[i + 3] - missingData[i + 3]) < 10
      ) {
        matchCount++;
      }
    }
  }

  // If >90% similar to missing glyph, consider it unsupported
  return totalPixels === 0 || matchCount / totalPixels < 0.9;
}

// Corner arrow with fallback: ⮌ (U+2B8C) -> ↩ (U+21A9)
const CORNER_ARROW = hasGlyph("⮌") ? "⮌" : "↩";

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
    stats: ["None", "Speed", "Stamina", "Power", "Guts", "Wit"],
    joiner: ", ",
  },
};

import tracknames from "../../uma-skill-tools/data/tracknames.json";
Object.keys(tracknames).forEach(
  (k) => (STRINGS["tracknames"][k] = tracknames[k][1]),
);

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function MaintenanceTime() {
  const start = new Date('2026-03-03T07:00:00Z');
  const end = new Date('2026-03-03T09:00:00Z');
  return <>{timeFmt.format(start)} – {timeFmt.format(end)}, {dateFmt.format(start)}</>;
}

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
  const [colorPalette, setColorPalette] = useState<ColorPalette>(
    savedPrefs.current.colorPalette,
  );
  const [uiScale, setUiScale] = useState(savedPrefs.current.uiScale);

  // Easter egg: "STILL" triggers yandere mode (dev only)
  const [yandereMode, setYandereMode] = useState(false);

  // Simulation settings
  const [samples, setSamples] = useState(savedSession.current?.samples ?? 500);
  const [mode, setMode] = useState<"compare" | "skill" | "stamina">(
    savedSession.current?.mode ?? "compare",
  );
  const [seed, setSeed] = useState(() =>
    Math.floor(Math.random() * 0xffffffff),
  );
  const [syncRng, setSyncRng] = useState(true);
  const [skillWisdomCheck_, setSkillWisdomCheck] = useState(true);
  const skillWisdomCheck = skillWisdomCheck_ || mode === "stamina";
  const [rushedKakari, setRushedKakari] = useState(true);
  const [leadCompetition, setLeadCompetition] = useState(false);
  const [competeFight, setCompeteFight] = useState(false);
  // Per-strategy dueling activation rates (0-100). Canonical defaults per docs/dueling.md.
  // Front Runners are excluded by the solver regardless.
  const [duelingRates, setDuelingRates] = useState<{
    runaway: number; frontRunner: number; paceChaser: number; lateSurger: number; endCloser: number;
  }>(() => {
    const saved = localStorage.getItem('umalator_v2_duelingRates');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return { runaway: 10, frontRunner: 20, paceChaser: 30, lateSurger: 35, endCloser: 35 };
  });
  useEffect(() => {
    localStorage.setItem('umalator_v2_duelingRates', JSON.stringify(duelingRates));
  }, [duelingRates]);
  const [laneMovement, setLaneMovement] = useState(true);
  const [autoSeed, setAutoSeed] = useState(false);
  const [forceFullSpurt, setForceFullSpurt] = useState(true);

  // Panel visibility
  const [umaDrawerOpen, setUmaDrawerOpen] = useState(false);
  const [activeUmaTab, setActiveUmaTab] = useState<1 | 2 | "trainees" | "umas">(1);
  // Lifted so the roster/filters/sort survive the tab unmount that Load triggers.
  const [umasState, setUmasState] = useState<UmasTabState>(initialUmasTabState);
  const [summaryDrawerOpen, setSummaryDrawerOpen] = useState(false);
  const [feedbackDrawerOpen, setFeedbackDrawerOpen] = useState(false);

  // Mobile navigation
  const [mobileView, setMobileView] = useState<MobileView>("track");
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // Velocity overlay toggles
  const [showVelocityOverlay, setShowVelocityOverlay] = useState(true);
  const [showHpOverlay, setShowHpOverlay] = useState(true);

  // Which run to display (mean/median/min/max)
  const [displayRun, setDisplayRun] = useState<
    "mean" | "median" | "min" | "max"
  >("median");


  // Simulation results
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<CompareResults | null>(null);
  const [hpcalcResults, setHpcalcResults] = useState<any>(null);

  // Skill chart results
  const [skillChartResults, setSkillChartResults] = useState<Map<string, any>>(
    new Map(),
  );
  const [skillChartProgress, setSkillChartProgress] = useState<{
    [workerId: number]: { round: number; total: number };
  }>({});
  const [completedWorkers, setCompletedWorkers] = useState(0);

  // Skill chart filters and state
  const [hideOwned, setHideOwned] = useState(false);
  const [hidePurple, setHidePurple] = useState(false);
  const [showUmaIcons, setShowUmaIcons] = useState(false);
  const [chartFastMode, setChartFastMode] = useState(false); // 2x faster, lower accuracy
  const [skillHints, setSkillHints] = useState<Map<string, number>>(new Map());
  const [hiddenSkills, setHiddenSkills] = useState<Set<string>>(new Set());
  const [hideNotInGame, setHideNotInGame] = useState(() => {
	const saved = localStorage.getItem('umalator_v2_hideNotInGame');
	return saved !== null ? saved === 'true' : true; // default: hidden
  });
  const [wideSkills, setWideSkills] = useState(() => localStorage.getItem('umalator_v2_wideSkills') !== 'false');
  const [selectedSkillForChart, setSelectedSkillForChart] = useState("");
  const [chartRunType, setChartRunType] = useState("medianrun");

  // Simulation worker (for compare mode)
  const worker = useMemo(() => {
    const w = new Worker(new URL("./simulator.worker.ts", import.meta.url), {
      type: "module",
    });
    w.addEventListener("message", (e: MessageEvent) => {
      const { type, results: workerResults } = e.data;
      switch (type) {
        case "compare":
          setResults(workerResults);
          break;
        case "compare-complete":
          setIsRunning(false);
          break;
        case "hpcalc":
          setHpcalcResults(workerResults);
          break;
        case "hpcalc-complete":
          setIsRunning(false);
          break;
      }
    });
    w.addEventListener("error", (e) => {
      console.error("[V2] Worker error:", e);
      setIsRunning(false);
    });
    return w;
  }, []);

  // Chart mode worker pool (4 workers for parallel skill testing)
  const chartWorkers = useMemo(() => {
    const workers: Array<Worker & { workerId?: number }> = [];
    for (let i = 0; i < 4; i++) {
      const w = new Worker(new URL("./simulator.worker.ts", import.meta.url), {
        type: "module",
      }) as Worker & { workerId?: number };
      w.workerId = i;
      w.addEventListener("message", (e: MessageEvent) => {
        const { type, workerId, results: workerResults, round, total } = e.data;

        switch (type) {
          case "chart-progress":
            setSkillChartProgress((prev) => ({
              ...prev,
              [workerId]: { round, total },
            }));
            break;

          case "chart-update":
            setSkillChartResults((prev) => {
              const merged = new Map(prev);
              if (workerResults instanceof Map) {
                workerResults.forEach((result: any, skillId: string) => {
                  merged.set(skillId, result);
                });
              } else if (workerResults && typeof workerResults === "object") {
                Object.entries(workerResults).forEach(
                  ([skillId, result]: [string, any]) => {
                    merged.set(skillId, result);
                  },
                );
              }
              return merged;
            });
            break;

          case "chart-complete":
            setCompletedWorkers((prev) => {
              const newCount = prev + 1;
              if (newCount === 4) {
                // All workers finished
                setIsRunning(false);
              }
              return newCount;
            });
            break;
        }
      });
      w.addEventListener("error", (e) => {
        console.error(`[V2] Chart Worker ${i} error:`, e);
        setIsRunning(false);
      });
      workers.push(w);
    }
    return workers;
  }, []);

  // Uma 1 state
  const [uma1, setUma1] = useState<UmaState>(
    savedSession.current?.uma1 ?? defaultUmaState,
  );

  // Uma 2 state (for compare mode)
  const [uma2, setUma2] = useState<UmaState>(
    savedSession.current?.uma2 ?? defaultUmaState,
  );

  // Map of groupId -> skillId for owned skills (for "Hide Owned" filter in skill chart)
  const hasSkills = useMemo(() => {
    const map = new Map<string, string>();
    uma1.skills.forEach((skillId) => {
      const groupId = (skillmeta as any)[skillId]?.groupId;
      if (groupId) {
        map.set(groupId, skillId);
      }
    });
    return map;
  }, [uma1.skills]);

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
  }, [
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
  ]);

  // Save preferences immediately
  useEffect(() => {
    savePreferences({ darkMode, colorPalette, uiScale });
  }, [darkMode, colorPalette, uiScale]);

  useEffect(() => {
	localStorage.setItem('umalator_v2_hideNotInGame', String(hideNotInGame));
  }, [hideNotInGame]);

  useEffect(() => {
	localStorage.setItem('umalator_v2_wideSkills', String(wideSkills));
  }, [wideSkills]);

  // Easter egg: detect "STILL" typed outside input fields (dev only, stripped in prod)
  useEffect(() => {
    if (!CC_DEV) return;
    let buffer = '';
    const TARGET = 'STILL';

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Only track letter keys
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        buffer += e.key.toUpperCase();
        // Keep only last N characters
        if (buffer.length > TARGET.length) {
          buffer = buffer.slice(-TARGET.length);
        }
        // Check for match
        if (buffer === TARGET) {
          setYandereMode(prev => !prev);
          buffer = '';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load state from URL on mount (supports ?preset=X and hash-based state)
  useEffect(() => {
    // Check for preset query parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const presetParam = urlParams.get("preset");
    if (presetParam) {
      const presetId = parseInt(presetParam, 10);
      const preset = presets.find((p) => p.id === presetId);
      if (preset) {
        setCourseId(preset.courseId);
        setGround(preset.ground);
        setWeather(preset.weather);
        setSeason(preset.season);
        setTime(preset.time);
        setSelectedPresetId(presetId);
        return; // Don't also load from hash
      }
    }

    // Otherwise, check for hash-based state
    const loadFromHash = async () => {
      if (window.location.hash) {
        const state = await deserializeStateFromHash(
          window.location.hash.slice(1),
        );
        if (state) {
          setCourseId(state.courseId);
          setGround(state.ground);
          setWeather(state.weather);
          setSeason(state.season);
          setTime(state.time);
          setSamples(state.samples);
          setUma1(state.uma1);
          setUma2(state.uma2);
          // Restore hint levels (older links omit this → empty map = all zero).
          setSkillHints(
            state.skillHints
              ? new Map(Object.entries(state.skillHints))
              : new Map(),
          );
          setSelectedPresetId(null);
        }
      }
    };
    loadFromHash();

    // Also handle hash changes
    const handleHashChange = () => loadFromHash();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

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

  // Skill info popover state
  const [popoverSkillId, setPopoverSkillId] = useState<string | null>(null);

  // Add skill from chart table (double-click)
  const handleAddSkillFromChart = useCallback((skillId: string) => {
    const groupId = skillmeta[skillId]?.groupId;
    if (!groupId) return;

    setUma1((prev) => {
      // Remove any existing skill in the same group, then add the new skill
      const filteredSkills = prev.skills.filter(
        (id) => skillmeta[id]?.groupId !== groupId,
      );
      return { ...prev, skills: [...filteredSkills, skillId] };
    });
  }, []);

  // Show skill info popover (click on skill icon)
  const handleShowSkillInfo = useCallback((skillId: string) => {
    setPopoverSkillId(skillId);
  }, []);

  // Close skill info popover on outside click
  useEffect(() => {
    const handleClick = () => setPopoverSkillId(null);
    document.body.addEventListener("click", handleClick);
    return () => document.body.removeEventListener("click", handleClick);
  }, []);

  // Notification banner — set NOTIFICATION_ID to show, or '' to hide
  const NOTIFICATION_ID = '';

  const [showNotification, setShowNotification] = useState(
    () => NOTIFICATION_ID !== '' && savedPrefs.current.notificationDismissed !== NOTIFICATION_ID,
  );

  const dismissNotification = useCallback(() => {
    setShowNotification(false);
    savePreferences({ notificationDismissed: NOTIFICATION_ID });
  }, []);

  // Mobile view change handler
  const handleMobileViewChange = useCallback((view: MobileView) => {
    setMobileView(view);
    // Close all drawers first
    setUmaDrawerOpen(false);
    setSummaryDrawerOpen(false);
    setFeedbackDrawerOpen(false);
    setMobileSettingsOpen(false);

    // Open the appropriate drawer/panel
    switch (view) {
      case "uma":
        setUmaDrawerOpen(true);
        break;
      case "timeline":
        setSummaryDrawerOpen(true);
        break;
      case "settings":
        setMobileSettingsOpen(true);
        break;
      case "track":
      default:
        // Just close everything, show track
        break;
    }
  }, []);

  // Run skill chart via 4 workers
  const handleRunSkillChart = useCallback(() => {
    setIsRunning(true);
    setCompletedWorkers(0);
    setSkillChartResults(new Map());
    setSkillChartProgress({});
    setSelectedSkillForChart(""); // Clear selection when starting new run

    const course = courseData[courseId];
    if (!course) {
      console.error("[V2] Course not found:", courseId);
      setIsRunning(false);
      return;
    }

    // Build race params with strategy for order-based skill filtering
    const racedef = buildRaceParameters(
      ground,
      weather,
      season,
      time,
      uma1.strategy,
    );

    // Get list of skills to test (filter to activateable skills only).
    // Pre-filter not-in-game skills here so we don't waste sim time on skills
    // that would be hidden from the chart display anyway.
    const baseSkills = getBaseSkillsToTest(uma1, hideNotInGame);
    const activateableSkills = getActivateableSkills(
      baseSkills,
      uma1,
      course,
      racedef,
    );

    if (activateableSkills.length === 0) {
      console.warn("[V2] No activateable skills found for this course");
      setIsRunning(false);
      return;
    }

    // Load skillmeta for worker
    import("../../skill_meta.json").then((skillmeta) => {
      // Distribute skills across 4 workers
      const quarter = Math.floor(activateableSkills.length / 4);
      const skillBatches = [
        activateableSkills.slice(0, quarter),
        activateableSkills.slice(quarter, quarter * 2),
        activateableSkills.slice(quarter * 2, quarter * 3),
        activateableSkills.slice(quarter * 3),
      ];

      const chartOptions = buildSimulationOptions({
        seed: seed || Math.floor(Math.random() * 2 ** 31),
        syncRng: false,
        skillWisdomCheck: false,
        rushedKakari: false,
        leadCompetition: false,
        competeFight: false,
        laneMovement: false,
      });

      // Send tasks to all 4 workers
      skillBatches.forEach((batch, i) => {
        if (batch.length > 0) {
          chartWorkers[i].postMessage({
            msg: "chart",
            data: {
              skills: batch,
              course,
              racedef,
              uma: convertUmaStateForWorker(uma1),
              pacer: getDefaultPacer(),
              options: chartOptions,
              skillmeta: skillmeta.default,
              workerId: i,
              fastMode: chartFastMode,
            },
          });
        }
      });
    });
  }, [
    courseId,
    ground,
    weather,
    season,
    time,
    uma1,
    seed,
    chartWorkers,
    chartFastMode,
  ]);

  // Run simulation via worker
  const handleRunSimulation = useCallback(() => {
    if (autoSeed) {
      setSeed(Math.floor(Math.random() * 0xFFFFFFFF));
    }
    if (mode === "compare") {
      setIsRunning(true);
      setResults(null);

      const course = courseData[courseId];
      if (!course) {
        console.error("[V2] Course not found:", courseId);
        setIsRunning(false);
        return;
      }

      // Send simulation request to worker
      worker.postMessage({
        msg: "compare",
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
            duelingRates: competeFight ? duelingRates : undefined,
            laneMovement,
          }),
        },
      });
    } else if (mode === "stamina") {
      setIsRunning(true);
      setHpcalcResults(null);

      const course = courseData[courseId];
      if (!course) {
        console.error("[V2] Course not found:", courseId);
        setIsRunning(false);
        return;
      }

      worker.postMessage({
        msg: "hpcalc",
        data: {
          nsamples: samples,
          course,
          racedef: buildRaceParameters(ground, weather, season, time),
          uma: convertUmaStateForWorker(uma1),
          pacer: getDefaultPacer(),
          options: {
            ...buildSimulationOptions({
              seed,
              syncRng,
              skillWisdomCheck,
              rushedKakari,
              leadCompetition,
              competeFight,
              duelingRates: competeFight ? duelingRates : undefined,
              laneMovement,
            }),
            forceFullSpurt,
          },
        },
      });
    } else {
      // Skill chart mode
      handleRunSkillChart();
    }
  }, [
    mode,
    courseId,
    samples,
    ground,
    weather,
    season,
    time,
    uma1,
    uma2,
    worker,
    seed,
    syncRng,
    skillWisdomCheck,
    rushedKakari,
    leadCompetition,
    competeFight,
    duelingRates,
    laneMovement,
    autoSeed,
    handleRunSkillChart,
  ]);

  // Get current snapshot based on displayRun selection
  const currentSnapshot = useMemo(() => {
    if (!results?.runData) return null;
    switch (displayRun) {
      case "min":
        return results.runData.minrun;
      case "max":
        return results.runData.maxrun;
      case "mean":
        return results.runData.meanrun;
      case "median":
        return results.runData.medianrun;
    }
  }, [results, displayRun]);

  // Stamina calculator snapshot - convert single-uma run data to RaceSnapshot format
  const [staminaRunType, setStaminaRunType] = useState<string>('medianrun');
  const staminaSnapshot = useMemo(() => {
    if (!hpcalcResults?.runData) return null;
    const run = hpcalcResults.runData[staminaRunType];
    if (!run) return null;
    // Pad single-uma data to two-uma RaceSnapshot format
    return {
      t: [run.t[0], []] as [number[], number[]],
      p: [run.p[0], []] as [number[], number[]],
      v: [run.v[0], []] as [number[], number[]],
      hp: [run.hp[0], []] as [number[], number[]],
      sk: [run.sk[0] || new Map(), new Map()] as [Map<string, number[][]>, Map<string, number[][]>],
      sdly: [run.sdly, 0] as [number, number],
      rushed: [[], []] as [[number, number][], [number, number][]],
      posKeep: [],
      competeFight: [[0, 0], [0, 0]] as [[number, number], [number, number]],
      leadCompetition: [[0, 0], [0, 0]] as [[number, number], [number, number]],
      downhillActivations: [[], []] as [[number, number][], [number, number][]],
    } as RaceSnapshot;
  }, [hpcalcResults, staminaRunType]);

  // Skill chart snapshot - selected skill's run data for visualization
  const skillChartSnapshot = useMemo(() => {
    if (mode !== "skill" || !selectedSkillForChart || !skillChartResults.has(selectedSkillForChart)) {
      return null;
    }
    const result = skillChartResults.get(selectedSkillForChart);
    if (!result?.runData) return null;

    // Get the selected run type (medianrun, minrun, maxrun, meanrun)
    return result.runData[chartRunType as keyof typeof result.runData] || result.runData.medianrun;
  }, [mode, selectedSkillForChart, skillChartResults, chartRunType]);

  // Extract skill activation regions from results for track visualization
  const skillRegions = useMemo(() => {
    // Use appropriate snapshot based on mode
    const snapshot = mode === "skill" ? skillChartSnapshot : mode === "stamina" ? staminaSnapshot : currentSnapshot;
    if (!snapshot) return [];

    const colors = [
      { stroke: "#2a77c5", fill: "rgba(42, 119, 197, 0.3)" }, // Uma 1 - blue
      { stroke: "#c52a2a", fill: "rgba(197, 42, 42, 0.3)" }, // Uma 2 - red
    ];

    const NO_SHOW = ["skill_empty", "skill_heal"]; // Icons to hide
    const regions: any[] = [];

    // Process skill activations for both umas
    [0, 1].forEach((umaIndex) => {
      const skillMap = snapshot.sk?.[umaIndex];
      if (!skillMap || !(skillMap instanceof Map)) return;

      skillMap.forEach((activations: number[][], skillId: string) => {
        if (!activations || activations.length === 0) return;

        // Skip unwanted skill icons
        const iconId = skillmeta[skillId]?.iconId;
        if (NO_SHOW.includes(iconId)) return;

        // Get skill name (prefer EN name at end of array for bilingual entries)
        const name = skillnames[skillId]?.slice(-1)[0] ?? skillId;

        activations.forEach((ar: number[]) => {
          if (!ar || ar.length < 2) return;
          regions.push({
            type: RegionDisplayType.Textbox,
            color: colors[umaIndex],
            text: name,
            skillId,
            umaIndex,
            regions: [
              { start: ar[0], end: ar[1] !== -1 ? ar[1] : ar[0] + 100 },
            ],
          });
        });
      });
    });

    return regions;
  }, [mode, skillChartSnapshot, currentSnapshot, staminaSnapshot]);

  // Build position keep labels from simulation results
  const posKeepLabels = useMemo(() => {
    if (!currentSnapshot) return [];

    const course = (courseData as any)[courseId];
    if (!course) return [];

    const posKeepColors = [
      { stroke: "rgb(42, 119, 197)", fill: "rgba(42, 119, 197, 0.6)" }, // Uma 1 - blue
      { stroke: "rgb(197, 42, 42)", fill: "rgba(197, 42, 42, 0.6)" }, // Uma 2 - red
    ];

    // Process posKeep data
    const posKeepData = (currentSnapshot.posKeep || [[], []]).flatMap(
      (posKeepArray: any[], umaIndex: number) => {
        if (!posKeepArray) return [];
        return posKeepArray.map((ar: number[]) => {
          const stateName =
            ar[2] === 1
              ? "PU"
              : ar[2] === 2
                ? "PDM"
                : ar[2] === 3
                  ? "SU"
                  : ar[2] === 4
                    ? "O"
                    : "Unknown";
          return {
            umaIndex,
            text: stateName,
            color: posKeepColors[umaIndex],
            start: ar[0],
            end: ar[1],
            duration: ar[1] - ar[0],
          };
        });
      },
    );

    // Process duel (compete fight) data
    const competeFightData: any[] = [];
    const competeFight = currentSnapshot.competeFight || [null, null];
    for (let umaIndex = 0; umaIndex < 2; umaIndex++) {
      const cf = competeFight[umaIndex];
      if (
        cf &&
        Array.isArray(cf) &&
        cf.length >= 2 &&
        (cf[0] !== 0 || cf[1] !== 0)
      ) {
        competeFightData.push({
          umaIndex,
          text: "Duel",
          color: posKeepColors[umaIndex],
          start: cf[0],
          end: cf[1],
          duration: cf[1] - cf[0],
        });
      }
    }

    // Process spot struggle (lead competition) data
    const leadCompetitionData: any[] = [];
    const leadComp = currentSnapshot.leadCompetition || [null, null];
    for (let umaIndex = 0; umaIndex < 2; umaIndex++) {
      const lc = leadComp[umaIndex];
      if (
        lc &&
        Array.isArray(lc) &&
        lc.length >= 2 &&
        (lc[0] !== 0 || lc[1] !== 0)
      ) {
        leadCompetitionData.push({
          umaIndex,
          text: "SS",
          color: posKeepColors[umaIndex],
          start: lc[0],
          end: lc[1],
          duration: lc[1] - lc[0],
        });
      }
    }

    // Process downhill activations
    const downhillData = (
      currentSnapshot.downhillActivations || [[], []]
    ).flatMap((downhillArray: [number, number][], umaIndex: number) => {
      if (!downhillArray) return [];
      return downhillArray.map((ar: number[]) => ({
        umaIndex,
        text: "DH",
        color: posKeepColors[umaIndex],
        start: ar[0],
        end: ar[1],
        duration: ar[1] - ar[0],
      }));
    });

    // Combine all labels
    const allLabels = [
      ...posKeepData,
      ...competeFightData,
      ...leadCompetitionData,
      ...downhillData,
    ];

    // Convert to positioned labels
    const tempLabels = allLabels.map((label) => ({
      ...label,
      x: (label.start / course.distance) * 960,
      width: (label.duration / course.distance) * 960,
      yOffset: 0,
    }));

    // Sort by x position
    tempLabels.sort((a, b) => a.x - b.x);

    // Calculate vertical offsets to avoid overlaps
    const posKeepLabelsFinal: any[] = [];
    for (let i = 0; i < tempLabels.length; i++) {
      const currentLabel = tempLabels[i];
      let maxYOffset = 40;

      for (let j = 0; j < i; j++) {
        const prevLabel = tempLabels[j];
        const overlap = !(
          currentLabel.x + currentLabel.width < prevLabel.x ||
          currentLabel.x > prevLabel.x + prevLabel.width
        );
        if (overlap) {
          maxYOffset = Math.max(maxYOffset, prevLabel.yOffset + 15);
        }
      }

      currentLabel.yOffset = maxYOffset;
      posKeepLabelsFinal.push(currentLabel);
    }

    return posKeepLabelsFinal;
  }, [currentSnapshot, courseId]);

  // Binary search helper for finding index at position
  const binSearch = useCallback((arr: number[], target: number) => {
    let lo = 0,
      hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, Math.min(lo, arr.length - 1));
  }, []);

  // Mouse move handler for velocity/HP readout
  const handleMouseMove = useCallback(
    (pct: number) => {
      const skillData = currentSnapshot;
      if (!skillData) return;

      const course = (courseData as any)[courseId];
      if (!course) return;

      const box = document.getElementById("rtMouseOverBox");
      if (box) box.style.display = "block";

      const x = pct * course.distance;
      const i0 = binSearch(skillData.p[0], x);
      const i1 = binSearch(skillData.p[1], x);

      const safeI0 = Math.max(0, Math.min(i0, skillData.v[0].length - 1));
      const safeI1 = Math.max(0, Math.min(i1, skillData.v[1].length - 1));

      const hp0 = skillData.hp?.[0]?.[safeI0]?.toFixed(0) ?? "N/A";
      const hp1 = skillData.hp?.[1]?.[safeI1]?.toFixed(0) ?? "N/A";

      const v1El = document.getElementById("rtV1");
      const v2El = document.getElementById("rtV2");
      if (v1El)
        v1El.textContent = `${skillData.v[0][safeI0].toFixed(2)} m/s  t=${skillData.t[0][safeI0].toFixed(2)}s  (${hp0} hp)`;
      if (v2El)
        v2El.textContent = `${skillData.v[1][safeI1].toFixed(2)} m/s  t=${skillData.t[1][safeI1].toFixed(2)}s  (${hp1} hp)`;
    },
    [currentSnapshot, courseId, binSearch],
  );

  const handleMouseLeave = useCallback(() => {
    const box = document.getElementById("rtMouseOverBox");
    if (box) box.style.display = "none";
  }, []);

  // Handle skill drag on race track to set forced positions
  const handleSkillDrag = useCallback(
    (skillId: string, umaIndex: number, newStart: number, _newEnd: number) => {
      const positionStr = newStart.toString();
      if (umaIndex === 0) {
        setUma1((prev) => ({
          ...prev,
          forcedSkillPositions: {
            ...prev.forcedSkillPositions,
            [skillId]: positionStr,
          },
        }));
      } else if (umaIndex === 1) {
        setUma2((prev) => ({
          ...prev,
          forcedSkillPositions: {
            ...prev.forcedSkillPositions,
            [skillId]: positionStr,
          },
        }));
      }
    },
    [],
  );

  // Wrap UmaState for RaceTrack compatibility (expects Immutable.js-style API)
  const wrapUmaForRaceTrack = useCallback(
    (uma: UmaState) => ({
      forcedSkillPositions: {
        has: (skillId: string) => skillId in uma.forcedSkillPositions,
        get: (skillId: string) => {
          const pos = uma.forcedSkillPositions[skillId];
          return pos ? parseInt(pos, 10) : undefined;
        },
      },
    }),
    [],
  );

  const uma1ForTrack = useMemo(
    () => wrapUmaForRaceTrack(uma1),
    [uma1, wrapUmaForRaceTrack],
  );
  const uma2ForTrack = useMemo(
    () => wrapUmaForRaceTrack(uma2),
    [uma2, wrapUmaForRaceTrack],
  );

  return (
    <Language.Provider value="en-global">
      <TourProvider autoStart={true}>
        <IntlProvider definition={STRINGS}>
          <div
            id="app-v2"
            class={`${darkMode ? "" : "light"} ${CC_DEV && yandereMode ? "yandere" : (colorPalette !== 'uma-green' ? colorPalette : '')} ${showNotification ? "v2-has-notification" : ""}`}
            style={{ "--ui-scale": uiScale / 100 } as any}
          >
            {showNotification && (
              <NotificationBanner onDismiss={dismissNotification}>
                Notice: Upcoming in-game maintenance period - <MaintenanceTime />.
              </NotificationBanner>
            )}

            {/* HEADER BAR - Track selection + conditions + run */}
            <header class="v2-header">
              <div class="v2-header-left">
                <CustomSelect
                  value={selectedPresetId}
                  onChange={(val) => handlePresetSelect(val as number | null)}
                  options={[
                    { value: null, label: "Custom" },
                    // Dropdown is windowed to the current CM ± 5; any other CM
                    // is still loadable via ?preset=. If the active selection is
                    // outside the window (e.g. loaded from a URL), surface it too.
                    ...(selectedPresetId != null &&
                    !visiblePresets.some((p) => p.id === selectedPresetId)
                      ? presets
                          .filter((p) => p.id === selectedPresetId)
                          .map((p) => ({
                            value: p.id,
                            label: `CM ${p.id} - ${p.name}`,
                          }))
                      : []),
                    ...visiblePresets.map((p) => ({
                      value: p.id,
                      label: `CM ${p.id} - ${p.name}`,
                    })),
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
                    class={mode === "skill" ? "active" : ""}
                    onClick={() => setMode("skill")}
                  >
                    <Zap size={14} />
                    Skill
                  </button>
                  <button
                    type="button"
                    class={mode === "stamina" ? "active" : ""}
                    onClick={() => setMode("stamina")}
                  >
                    <Heart size={14} />
                    Stamina
                  </button>
                </div>
                <Button
                  variant="primary"
                  className="v2-run-btn"
                  icon={<Play size={14} />}
                  onClick={handleRunSimulation}
                  disabled={isRunning}
                >
                  {isRunning ? "Running..." : "RUN"}
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
                      id: "theme",
                      label: "",
                      custom: (
                        <div class="v2-theme-toggle">
                          <button
                            type="button"
                            class={`v2-theme-btn ${darkMode ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDarkMode(true);
                            }}
                          >
                            Dark
                          </button>
                          <button
                            type="button"
                            class={`v2-theme-btn ${!darkMode ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDarkMode(false);
                            }}
                          >
                            Light
                          </button>
                        </div>
                      ),
                    },
                    {
                      id: "accent",
                      label: "",
                      custom: (
                        <div class="v2-color-toggle">
                          {COLOR_PALETTES.map((palette) => (
                            <button
                              key={palette}
                              type="button"
                              class={`v2-color-swatch ${palette} ${colorPalette === palette ? 'active' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setColorPalette(palette);
                              }}
                              title={palette.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            />
                          ))}
                        </div>
                      ),
                    },
                    { id: "divider-scale", label: "", divider: true },
                    {
                      id: "zoom-control",
                      label: "",
                      custom: (
                        <div class="v2-zoom-control">
                          <button
                            type="button"
                            class="v2-zoom-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUiScale(Math.max(80, uiScale - 5));
                            }}
                            disabled={uiScale <= 80}
                          >
                            <Minus size={14} />
                          </button>
                          <span class="v2-zoom-value">{uiScale}%</span>
                          <button
                            type="button"
                            class="v2-zoom-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUiScale(Math.min(120, uiScale + 5));
                            }}
                            disabled={uiScale >= 120}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ),
                    },
                    { id: "divider-link", label: "", divider: true },
                    {
                      id: "copy-link",
                      label: "Copy Link",
                      icon: <Link size={16} />,
                      onClick: () => {
                        copyShareableUrl({
                          courseId,
                          ground,
                          weather,
                          season,
                          time,
                          samples,
                          uma1,
                          uma2,
                          // Only persist non-zero hint levels to keep the link compact.
                          skillHints: Object.fromEntries(
                            [...skillHints].filter(([, v]) => v > 0),
                          ),
                        });
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
                {/* Menu/apps dropdown: contains links to HP Calc, Docs, Events (to be added) */}
                <Dropdown
                  align="right"
                  trigger={
                    <Button
                      variant="secondary"
                      className="v2-settings-btn v2-apps-btn"
                    >
                      <Menu size={16} />
                    </Button>
                  }
                  items={[
                    {
                      id: "hp-calc",
                      label: "HP Calculator",
                      icon: <Calculator size={16} />,
                      onClick: () =>
                        window.open(
                          "/hp-calculator/",
                          "_blank",
                        ),
                    },
                    {
                      id: "events",
                      label: "Events",
                      icon: <Calendar size={16} />,
                      onClick: () =>
                        window.open("/events/", "_blank"),
                    },
                    {
                      id: "docs",
                      label: "Docs",
                      icon: <Book size={16} />,
                      onClick: () =>
                        window.open("/docs/", "_blank"),
                    },
                  ]}
                />
              </div>
            </header>

            {/* SIMULATION SETTINGS BAR */}
            <SimulationSettings
              samples={samples}
              setSamples={setSamples}
              seed={seed}
              setSeed={setSeed}
              syncRng={syncRng}
              setSyncRng={setSyncRng}
              skillWisdomCheck={skillWisdomCheck}
              setSkillWisdomCheck={setSkillWisdomCheck}
              rushedKakari={rushedKakari}
              setRushedKakari={setRushedKakari}
              leadCompetition={leadCompetition}
              setLeadCompetition={setLeadCompetition}
              competeFight={competeFight}
              setCompeteFight={setCompeteFight}
              duelingRates={duelingRates}
              setDuelingRates={setDuelingRates}
              laneMovement={laneMovement}
              setLaneMovement={setLaneMovement}
              autoSeed={autoSeed}
              setAutoSeed={setAutoSeed}
              hideNotInGame={hideNotInGame}
              setHideNotInGame={setHideNotInGame}
              mode={mode}
            />

            {/* Content area wrapper for widescreen layout */}
            <div class="v2-content-area">
              {/* MAIN CONTENT - RaceTrack takes center stage */}
              <main class="v2-main">
                {/* RaceTrack - Always visible (like v1) */}
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
                    onSkillDrag={handleSkillDrag}
                    regions={skillRegions}
                    posKeepLabels={posKeepLabels}
                    uma1={uma1ForTrack}
                    uma2={uma2ForTrack}
                  >
                    {/* Velocity overlay - use appropriate snapshot based on mode */}
                    {((mode === "compare" && currentSnapshot) || (mode === "skill" && skillChartSnapshot) || (mode === "stamina" && staminaSnapshot)) && (
                      <VelocityOverlay
                        data={mode === "skill" ? skillChartSnapshot : mode === "stamina" ? staminaSnapshot : currentSnapshot}
                        courseDistance={
                          (courseData as any)[courseId]?.distance ?? 2000
                        }
                        width={960}
                        height={250}
                        xOffset={20}
                        showVelocity={showVelocityOverlay}
                        showHp={showHpOverlay}
                      />
                    )}

                    {/* Mouse-over readout box (same as v1) */}
                    <g id="rtMouseOverBox" class="v2-track-readout" style="display:none">
                      <text
                        id="rtV1"
                        x="25"
                        y="10"
                        fill="#4a9eff"
                        font-size="10px"
                      ></text>
                      <text
                        id="rtV2"
                        x="25"
                        y="20"
                        fill="#ff6b6b"
                        font-size="10px"
                      ></text>
                    </g>
                  </RaceTrack>

                  {/* Velocity toggle controls below track - show when there's data to display */}
                  {((mode === "compare" && results) || (mode === "skill" && skillChartSnapshot) || (mode === "stamina" && staminaSnapshot)) && (
                    <div class="v2-velocity-toggles">
                      <label class="v2-switch">
                        <input
                          type="checkbox"
                          checked={showVelocityOverlay}
                          onChange={(e) =>
                            setShowVelocityOverlay(
                              (e.target as HTMLInputElement).checked,
                            )
                          }
                        />
                        <span class="v2-switch-slider" />
                        <span class="v2-switch-label">Velocity</span>
                      </label>
                      <label class="v2-switch">
                        <input
                          type="checkbox"
                          checked={showHpOverlay}
                          onChange={(e) =>
                            setShowHpOverlay(
                              (e.target as HTMLInputElement).checked,
                            )
                          }
                        />
                        <span class="v2-switch-slider" />
                        <span class="v2-switch-label">HP</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Mode-specific content below track */}
                {mode === "skill" ? (
                  <div class="v2-skill-chart-container">
                    {/* Filter controls */}
                    <div class="v2-skill-chart-controls">
                      <div class="v2-skill-chart-filters">
                        <label class="v2-switch">
                          <input
                            type="checkbox"
                            checked={hideOwned}
                            onChange={(e) =>
                              setHideOwned(
                                (e.target as HTMLInputElement).checked,
                              )
                            }
                          />
                          <span class="v2-switch-slider" />
                          <span class="v2-switch-label">Hide Owned</span>
                        </label>
                        <label class="v2-switch">
                          <input
                            type="checkbox"
                            checked={hidePurple}
                            onChange={(e) =>
                              setHidePurple(
                                (e.target as HTMLInputElement).checked,
                              )
                            }
                          />
                          <span class="v2-switch-slider" />
                          <span class="v2-switch-label">Hide Purple</span>
                        </label>
                        <label class="v2-switch">
                          <input
                            type="checkbox"
                            checked={showUmaIcons}
                            onChange={(e) =>
                              setShowUmaIcons(
                                (e.target as HTMLInputElement).checked,
                              )
                            }
                          />
                          <span class="v2-switch-slider" />
                          <span class="v2-switch-label">Uma Icons</span>
                        </label>
                        <label
                          class="v2-switch"
                          title="2x faster simulation with lower accuracy (50 samples vs 200)"
                        >
                          <input
                            type="checkbox"
                            checked={chartFastMode}
                            onChange={(e) =>
                              setChartFastMode(
                                (e.target as HTMLInputElement).checked,
                              )
                            }
                          />
                          <span class="v2-switch-slider" />
                          <span class="v2-switch-label">Fast ⚡</span>
                        </label>
                      </div>
                      <div class="v2-skill-chart-actions">
                        {skillHints.size > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSkillHints(new Map())}
                          >
                            Reset Hints
                          </Button>
                        )}
                        {hiddenSkills.size > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setHiddenSkills(new Set())}
                          >
                            Show Hidden ({hiddenSkills.size})
                          </Button>
                        )}
                      </div>
                      {/* Progress indicator */}
                      {isRunning &&
                        Object.keys(skillChartProgress).length > 0 && (
                          <div class="v2-skill-chart-progress">
                            {Object.entries(skillChartProgress).map(
                              ([workerId, progress]) => (
                                <div key={workerId} class="v2-worker-progress">
                                  Worker {workerId}: Round {progress.round}/
                                  {progress.total}
                                </div>
                              ),
                            )}
                          </div>
                        )}
                    </div>

                    {/* Skill chart table */}
                    {skillChartResults.size > 0 ? (
                      <SkillChartPane
                        data={Array.from(skillChartResults.values())}
                        courseDistance={
                          (courseData as any)[courseId]?.distance ?? 2000
                        }
                        hints={skillHints}
                        hasSkills={hasSkills}
                        updateHint={(id, hint) => {
                          setSkillHints((prev) => {
                            const next = new Map(prev);
                            next.set(id, hint);
                            return next;
                          });
                        }}
                        onRunTypeChange={setChartRunType}
                        onSelectionChange={setSelectedSkillForChart}
                        onInfoClick={handleShowSkillInfo}
                        onDblClickRow={handleAddSkillFromChart}
                        expandedContent={(
                          skillId,
                          runData,
                          courseDistance,
                          sampleCount,
                        ) => (
                          <SkillChartDetail
                            skillId={skillId}
                            runData={runData}
                            courseDistance={courseDistance}
                            umaIndex={1}
                            sampleCount={sampleCount}
                          />
                        )}
                        showUmaIcons={showUmaIcons}
                        hideOwned={hideOwned}
                        hidePurple={hidePurple}
                        hideNotInGame={hideNotInGame}
                        dirty={false}
                        selectedSkillId={selectedSkillForChart}
                        hiddenSkills={hiddenSkills}
                        onHideSkill={(id) => setHiddenSkills(prev => {
                          const next = new Set(prev);
                          next.add(id);
                          return next;
                        })}
                      />
                    ) : (
                      <div class="v2-skill-chart-empty">
                        {isRunning ? (
                          <div>
                            <Zap size={48} />
                            <h2>Running Skill Chart...</h2>
                            <p>
                              Testing skills across{" "}
                              {Object.keys(skillChartProgress).length} workers
                            </p>
                          </div>
                        ) : (
                          <div>
                            <Zap size={48} />
                            <h2>Skill Chart Mode</h2>
                            <p>
                              Click RUN to test all skills on the selected
                              course
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : mode === "stamina" ? (
                  /* RESULTS - Stamina calculator mode */
                  <div class="v2-results-pane">
                    <div class="stacalc-controls">
                      <label class="v2-switch">
                        <input
                          type="checkbox"
                          checked={forceFullSpurt}
                          onChange={(e) => setForceFullSpurt((e.target as HTMLInputElement).checked)}
                        />
                        <span class="v2-switch-slider" />
                        <span class="v2-switch-label">Force Full Spurt</span>
                      </label>
                      <Tooltip content="When ON, the uma always sprints at max speed in the final stretch — even without enough stamina. Remaining HP can go negative, showing how much stamina you're short. When OFF, the uma slows down if stamina is low, matching real race behavior." position="bottom" className="stacalc-info-tooltip">
                        <HelpCircle size={14} class="stacalc-info-icon" />
                      </Tooltip>
                    </div>
                    {hpcalcResults ? (
                      <StaCalcResults
                        results={hpcalcResults}
                        nsamples={samples}
                        strategy={uma1.strategy}
                        courseDistance={courseData[courseId]?.distance || 2000}
                        onSelectRun={(runType) => setStaminaRunType(runType)}
                      />
                    ) : isRunning ? (
                      <div class="v2-results-pane v2-results-empty">
                        <div class="v2-results-running">
                          <span class="v2-spinner" />
                          Running stamina analysis...
                        </div>
                      </div>
                    ) : (
                      <div class="v2-results-pane v2-results-empty">
                        <div class="v2-results-placeholder">
                          <Heart size={32} />
                          <p>Click RUN to analyze stamina requirements</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* RESULTS - Compare mode */
                  <V2ResultsPane
                    results={results}
                    isRunning={isRunning}
                    courseId={courseId}
                    onRunSimulation={handleRunSimulation}
                    displayRun={displayRun}
                    onDisplayRunChange={setDisplayRun}
                  />
                )}
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
                  <button
                    onClick={() => {
                      setUmaDrawerOpen(false);
                      setMobileView("track");
                    }}
                  >
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
                    class={`v2-uma-tab-trainees ${activeUmaTab === "trainees" ? "active" : ""}`}
                    onClick={() => setActiveUmaTab("trainees")}
                  >
                    <Users size={14} />
                    Saved
                  </button>
                  <button
                    type="button"
                    class={`v2-uma-tab-umas ${activeUmaTab === "umas" ? "active" : ""}`}
                    onClick={() => setActiveUmaTab("umas")}
                  >
                    <LayoutGrid size={14} />
                    Umas
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
                      courseDistance={
                        (courseData as Record<string, { distance: number }>)[
                          courseId
                        ]?.distance
                      }
                      hideNotInGame={hideNotInGame}
                      wideSkills={wideSkills}
                      setWideSkills={setWideSkills}
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
                      courseDistance={
                        (courseData as Record<string, { distance: number }>)[
                          courseId
                        ]?.distance
                      }
                      hideNotInGame={hideNotInGame}
                      wideSkills={wideSkills}
                      setWideSkills={setWideSkills}
                    />
                  )}
                  {activeUmaTab === "trainees" && (
                    <TraineesTab
                      onLoadToUma1={handleUma1Load}
                      onLoadToUma2={handleUma2Load}
                      currentMode={mode}
                      currentUma1={uma1}
                      currentUma2={uma2}
                    />
                  )}
                  {activeUmaTab === "umas" && (
                    <UmasTab
                      state={umasState}
                      onStateChange={setUmasState}
                      onLoadToUma1={(s) => { handleUma1Load(s); setActiveUmaTab(1); }}
                      onLoadToUma2={(s) => { handleUma2Load(s); setActiveUmaTab(2); }}
                      currentMode={mode}
                      course={courseData[courseId]}
                    />
                  )}
                </div>
              </aside>
            </div>
            {/* End v2-content-area */}

            {/* RACE SUMMARY DRAWER - Slides in from right */}
            <aside
              class={`v2-summary-drawer ${summaryDrawerOpen ? "open" : ""}`}
            >
              {/* Toggle tab attached to drawer edge */}
              <button
                class="v2-summary-toggle"
                onClick={() => setSummaryDrawerOpen(!summaryDrawerOpen)}
              >
                Timeline ◀
              </button>

              <div class="v2-drawer-header">
                <h2>Race Summary</h2>
                <button
                  onClick={() => {
                    setSummaryDrawerOpen(false);
                    setMobileView("track");
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div class="v2-drawer-content">
                {results?.runData?.medianrun ? (
                  <RaceSummary
                    medianrun={results.runData.medianrun}
                    courseDistance={
                      (courseData as any)[courseId]?.distance ?? 2000
                    }
                    skillnames={skillnames}
                    result={
                      results.results.length > 0
                        ? results.results[
                            Math.floor(results.results.length / 2)
                          ]
                        : 0
                    }
                  />
                ) : (
                  <p
                    style={{
                      color: "var(--color-text-muted)",
                      textAlign: "center",
                      padding: "var(--space-lg)",
                    }}
                  >
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
                .&nbsp; Credit to the original authors:&nbsp;
                <a
                  href="https://github.com/alpha123/uma-tools"
                  target="_blank"
                  rel="noopener"
                >
                  pecan (alpha123)
                </a>
                ,&nbsp;
                <a
                  href="https://github.com/kachi-dev/uma-tools"
                  target="_blank"
                  rel="noopener"
                >
                  the VFalator team (esp. kachi and Jecht)
                </a>
                ,&nbsp;and special thanks to the community at &nbsp;
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
                  href="/hp-calculator/"
                  target="_blank"
                  rel="noopener"
                >
                  HP Calculator
                </a>
              </div>
            </footer>

            {/* Backdrop when drawer is open */}
            {umaDrawerOpen && (
              <div
                class="v2-backdrop"
                onClick={() => {
                  setUmaDrawerOpen(false);
                  setMobileView("track");
                }}
              />
            )}

            {/* Tour overlay - renders via portal */}
            <TourOverlay />

            {/* Skill info popover */}
            {popoverSkillId && skillChartResults.has(popoverSkillId) && (
              <div
                class="v2-skill-popover"
                onClick={(e) => e.stopPropagation()}
              >
                <div class="v2-skill-popover-header">
                  <img
                    src={`/uma-tools/icons/${skillmeta[popoverSkillId]?.iconId || popoverSkillId}.png`}
                    alt=""
                    class="v2-skill-popover-icon"
                  />
                  <span class="v2-skill-popover-name">
                    {skillnames[popoverSkillId] || popoverSkillId}
                  </span>
                  <button
                    type="button"
                    class="v2-skill-popover-close"
                    onClick={() => setPopoverSkillId(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div class="v2-skill-popover-stats">
                  <span>
                    Median:{" "}
                    {skillChartResults.get(popoverSkillId)?.median.toFixed(2)}L
                  </span>
                  <span>
                    Mean:{" "}
                    {skillChartResults.get(popoverSkillId)?.mean.toFixed(2)}L
                  </span>
                  <span>
                    Range:{" "}
                    {skillChartResults.get(popoverSkillId)?.min.toFixed(2)} ~{" "}
                    {skillChartResults.get(popoverSkillId)?.max.toFixed(2)}L
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    handleAddSkillFromChart(popoverSkillId);
                    setPopoverSkillId(null);
                  }}
                >
                  Add to Uma 1
                </Button>
              </div>
            )}

            {/* Feedback drawer (gated by VITE_ENABLE_FEEDBACK + webhook presence) */}
            {FEEDBACK_ENABLED && (
              <Fragment>
                <FeedbackDrawer
                  isOpen={feedbackDrawerOpen}
                  onClose={() => {
                    setFeedbackDrawerOpen(false);
                    setMobileView("track");
                  }}
                  webhookUrl={DISCORD_FEEDBACK_WEBHOOK}
                />
                {!feedbackDrawerOpen && (
                  <button
                    type="button"
                    class="v2-feedback-toggle"
                    onClick={() => setFeedbackDrawerOpen(true)}
                    aria-label="Send feedback"
                  >
                    <MessageSquare size={18} />
                    <span>Feedback</span>
                  </button>
                )}
              </Fragment>
            )}

            {/* Mobile bottom navigation */}
            <MobileNav
              activeView={mobileView}
              onViewChange={handleMobileViewChange}
              onRun={handleRunSimulation}
              isRunning={isRunning}
              hasResults={!!results}
            />

            {/* Mobile settings panel */}
            {mobileSettingsOpen && (
              <>
                <div
                  class="v2-backdrop v2-mobile-backdrop"
                  onClick={() => {
                    setMobileSettingsOpen(false);
                    setMobileView("track");
                  }}
                />
                <div class="v2-mobile-settings open">
                  <div class="v2-mobile-settings-header">
                    <h3>Settings</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileSettingsOpen(false);
                        setMobileView("track");
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div class="v2-mobile-settings-content">
                    <div class="v2-mobile-settings-section">
                      <h4>Track & Course</h4>
                      <V2TrackSelect
                        courseid={courseId}
                        setCourseid={(id) => {
                          setSelectedPresetId(null);
                          setCourseId(id);
                        }}
                      />
                    </div>
                    <div class="v2-mobile-settings-section">
                      <h4>Mode</h4>
                      <div class="v2-mode-toggle" style={{ display: "flex" }}>
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
                          class={mode === "skill" ? "active" : ""}
                          onClick={() => setMode("skill")}
                        >
                          <Zap size={14} />
                          Skill
                        </button>
                        <button
                          type="button"
                          class={mode === "stamina" ? "active" : ""}
                          onClick={() => setMode("stamina")}
                        >
                          <Heart size={14} />
                          Stamina
                        </button>
                      </div>
                    </div>
                    <div class="v2-mobile-settings-section">
                      <h4>Race Conditions</h4>
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
                    <div class="v2-mobile-settings-section">
                      <h4>Simulation</h4>
                      <SimulationSettings
                        samples={samples}
                        setSamples={setSamples}
                        seed={seed}
                        setSeed={setSeed}
                        syncRng={syncRng}
                        setSyncRng={setSyncRng}
                        skillWisdomCheck={skillWisdomCheck}
                        setSkillWisdomCheck={setSkillWisdomCheck}
                        rushedKakari={rushedKakari}
                        setRushedKakari={setRushedKakari}
                        leadCompetition={leadCompetition}
                        setLeadCompetition={setLeadCompetition}
                        competeFight={competeFight}
                        setCompeteFight={setCompeteFight}
                        duelingRates={duelingRates}
                        setDuelingRates={setDuelingRates}
                        laneMovement={laneMovement}
                        setLaneMovement={setLaneMovement}
                        autoSeed={autoSeed}
                        setAutoSeed={setAutoSeed}
                        hideNotInGame={hideNotInGame}
                        setHideNotInGame={setHideNotInGame}
                        mode={mode}
                      />
                    </div>
                    <div class="v2-mobile-settings-section">
                      <h4>Appearance</h4>
                      <div class="v2-mobile-settings-row">
                        <label>{darkMode ? "Dark Mode" : "Light Mode"}</label>
                        <label class="v2-switch">
                          <input
                            type="checkbox"
                            checked={darkMode}
                            onChange={() => setDarkMode(!darkMode)}
                          />
                          <span class="v2-switch-slider" />
                        </label>
                      </div>
                      <div class="v2-mobile-settings-row v2-mobile-color-row">
                        <label>Color</label>
                        <div class="v2-color-toggle">
                          {COLOR_PALETTES.map((palette) => (
                            <button
                              key={palette}
                              type="button"
                              class={`v2-color-swatch ${palette} ${colorPalette === palette ? 'active' : ''}`}
                              onClick={() => setColorPalette(palette)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div class="v2-mobile-settings-section">
                      <h4>Tools</h4>
                      <Button
                        variant="ghost"
                        className="v2-mobile-settings-btn"
                        onClick={() => window.open("/hp-calculator/", "_blank")}
                        icon={<Calculator size={14} />}
                      >
                        HP Calculator
                      </Button>
                      <Button
                        variant="ghost"
                        className="v2-mobile-settings-btn"
                        onClick={() => window.open("/events/", "_blank")}
                        icon={<Calendar size={14} />}
                      >
                        Events
                      </Button>
                      <Button
                        variant="ghost"
                        className="v2-mobile-settings-btn"
                        onClick={() => window.open("/docs/", "_blank")}
                        icon={<Book size={14} />}
                      >
                        Docs
                      </Button>
                    </div>
                    <div class="v2-mobile-settings-section">
                      <h4>Actions</h4>
                      <Button
                        variant="secondary"
                        className="v2-mobile-settings-btn"
                        onClick={() => setFeedbackDrawerOpen(true)}
                        icon={<MessageSquare size={14} />}
                      >
                        Send Feedback
                      </Button>
                      <Button
                        variant="ghost"
                        className="v2-mobile-settings-btn"
                        onClick={() => {
                          savePreferences({ tourCompleted: false });
                          window.location.reload();
                        }}
                        icon={<HelpCircle size={14} />}
                      >
                        Restart Tour
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </IntlProvider>
      </TourProvider>
    </Language.Provider>
  );
}

render(<App />, document.getElementById("app")!);
