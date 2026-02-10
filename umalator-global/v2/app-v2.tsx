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
  GitCompare,
  Zap,
  Sun,
  Moon,
  X,
  Palette,
  ArrowLeftRight,
  Link,
} from "./components";
import { Users, HelpCircle, MessageSquare, Minus, Plus } from "lucide-react";
import { V2TrackSelect } from "./track-select";
import { CompactConditions } from "./conditions";
import { presets, DEFAULT_PRESET } from "./presets";
import { V2UmaPanel, UmaState, defaultUmaState, IntroVideo } from "./uma-panel";
import { TraineesTab } from "./trainees-tab";
import { V2ResultsPane, CompareResults, RaceSnapshot } from "./results-pane";
import { VelocityOverlay } from "./velocity-overlay";
import { TourProvider, TourOverlay } from "./tour";
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
} from "./storage";
import courseData from "../course_data.json";
import skillnames from "../skillnames.json";
import "./v2.css";
import "./tour/tour.css";

// Discord webhook for feedback submissions (configure in environment or replace with actual URL)
const DISCORD_FEEDBACK_WEBHOOK = "https://discord.com/api/webhooks/1468463273316847687/poe7J751B6hJV3MAEzYtNMLK2VY3BIj1eedzPgpE2vKKTQOv_AUzc2B5a3cmztgE1aB6";

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
  const [uiScale, setUiScale] = useState(savedPrefs.current.uiScale);

  // Simulation settings
  const [samples, setSamples] = useState(savedSession.current?.samples ?? 500);
  const [mode, setMode] = useState<"compare" | "skill">(
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
  const [feedbackDrawerOpen, setFeedbackDrawerOpen] = useState(false);

  // Mobile navigation
  const [mobileView, setMobileView] = useState<MobileView>('track');
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);

  // Velocity overlay toggles
  const [showVelocityOverlay, setShowVelocityOverlay] = useState(true);
  const [showHpOverlay, setShowHpOverlay] = useState(true);

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
    savePreferences({ darkMode, classicGreen, uiScale });
  }, [darkMode, classicGreen, uiScale]);

  // Load state from URL hash on mount
  useEffect(() => {
    const loadFromHash = async () => {
      if (window.location.hash) {
        const state = await deserializeStateFromHash(window.location.hash.slice(1));
        if (state) {
          setCourseId(state.courseId);
          setGround(state.ground);
          setWeather(state.weather);
          setSeason(state.season);
          setTime(state.time);
          setSamples(state.samples);
          setUma1(state.uma1);
          setUma2(state.uma2);
          setSelectedPresetId(null); // Clear preset since we're loading custom state
          console.log('[V2] Loaded state from URL hash');
        }
      }
    };
    loadFromHash();

    // Also handle hash changes
    const handleHashChange = () => loadFromHash();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
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

  // Notification banner
  const [showNotification, setShowNotification] = useState(() => !savedPrefs.current.notificationDismissed);

  const dismissNotification = useCallback(() => {
    setShowNotification(false);
    savePreferences({ notificationDismissed: true });
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
      case 'uma':
        setUmaDrawerOpen(true);
        break;
      case 'timeline':
        setSummaryDrawerOpen(true);
        break;
      case 'settings':
        setMobileSettingsOpen(true);
        break;
      case 'track':
      default:
        // Just close everything, show track
        break;
    }
  }, []);

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

  // Build position keep labels from simulation results
  const posKeepLabels = useMemo(() => {
    if (!currentSnapshot) return [];

    const course = (courseData as any)[courseId];
    if (!course) return [];

    const posKeepColors = [
      { stroke: 'rgb(42, 119, 197)', fill: 'rgba(42, 119, 197, 0.6)' },  // Uma 1 - blue
      { stroke: 'rgb(197, 42, 42)', fill: 'rgba(197, 42, 42, 0.6)' }     // Uma 2 - red
    ];

    // Process posKeep data
    const posKeepData = (currentSnapshot.posKeep || [[], []]).flatMap((posKeepArray: any[], umaIndex: number) => {
      if (!posKeepArray) return [];
      return posKeepArray.map((ar: number[]) => {
        const stateName = ar[2] === 1 ? 'PU' : ar[2] === 2 ? 'PDM' : ar[2] === 3 ? 'SU' : ar[2] === 4 ? 'O' : 'Unknown';
        return {
          umaIndex,
          text: stateName,
          color: posKeepColors[umaIndex],
          start: ar[0],
          end: ar[1],
          duration: ar[1] - ar[0]
        };
      });
    });

    // Process duel (compete fight) data
    const competeFightData: any[] = [];
    const competeFight = currentSnapshot.competeFight || [null, null];
    for (let umaIndex = 0; umaIndex < 2; umaIndex++) {
      const cf = competeFight[umaIndex];
      if (cf && Array.isArray(cf) && cf.length >= 2 && (cf[0] !== 0 || cf[1] !== 0)) {
        competeFightData.push({
          umaIndex,
          text: 'Duel',
          color: posKeepColors[umaIndex],
          start: cf[0],
          end: cf[1],
          duration: cf[1] - cf[0]
        });
      }
    }

    // Process spot struggle (lead competition) data
    const leadCompetitionData: any[] = [];
    const leadComp = currentSnapshot.leadCompetition || [null, null];
    for (let umaIndex = 0; umaIndex < 2; umaIndex++) {
      const lc = leadComp[umaIndex];
      if (lc && Array.isArray(lc) && lc.length >= 2 && (lc[0] !== 0 || lc[1] !== 0)) {
        leadCompetitionData.push({
          umaIndex,
          text: 'SS',
          color: posKeepColors[umaIndex],
          start: lc[0],
          end: lc[1],
          duration: lc[1] - lc[0]
        });
      }
    }

    // Process downhill activations
    const downhillData = (currentSnapshot.downhillActivations || [[], []]).flatMap((downhillArray: [number, number][], umaIndex: number) => {
      if (!downhillArray) return [];
      return downhillArray.map((ar: number[]) => ({
        umaIndex,
        text: 'DH',
        color: posKeepColors[umaIndex],
        start: ar[0],
        end: ar[1],
        duration: ar[1] - ar[0]
      }));
    });

    // Combine all labels
    const allLabels = [...posKeepData, ...competeFightData, ...leadCompetitionData, ...downhillData];

    // Convert to positioned labels
    const tempLabels = allLabels.map(label => ({
      ...label,
      x: label.start / course.distance * 960,
      width: label.duration / course.distance * 960,
      yOffset: 0
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
        const overlap = !(currentLabel.x + currentLabel.width < prevLabel.x ||
                         currentLabel.x > prevLabel.x + prevLabel.width);
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
    const skillData = currentSnapshot;
    if (!skillData) return;

    const course = (courseData as any)[courseId];
    if (!course) return;

    const box = document.getElementById('rtMouseOverBox');
    if (box) box.style.display = 'block';

    const x = pct * course.distance;
    const i0 = binSearch(skillData.p[0], x);
    const i1 = binSearch(skillData.p[1], x);

    const safeI0 = Math.max(0, Math.min(i0, skillData.v[0].length - 1));
    const safeI1 = Math.max(0, Math.min(i1, skillData.v[1].length - 1));

    const hp0 = skillData.hp?.[0]?.[safeI0]?.toFixed(0) ?? 'N/A';
    const hp1 = skillData.hp?.[1]?.[safeI1]?.toFixed(0) ?? 'N/A';

    const v1El = document.getElementById('rtV1');
    const v2El = document.getElementById('rtV2');
    if (v1El) v1El.textContent = `${skillData.v[0][safeI0].toFixed(2)} m/s  t=${skillData.t[0][safeI0].toFixed(2)}s  (${hp0} hp)`;
    if (v2El) v2El.textContent = `${skillData.v[1][safeI1].toFixed(2)} m/s  t=${skillData.t[1][safeI1].toFixed(2)}s  (${hp1} hp)`;
  }, [currentSnapshot, courseId, binSearch]);

  const handleMouseLeave = useCallback(() => {
    const box = document.getElementById('rtMouseOverBox');
    if (box) box.style.display = 'none';
  }, []);

  // Handle skill drag on race track to set forced positions
  const handleSkillDrag = useCallback((skillId: string, umaIndex: number, newStart: number, _newEnd: number) => {
    const positionStr = newStart.toString();
    if (umaIndex === 0) {
      setUma1(prev => ({
        ...prev,
        forcedSkillPositions: { ...prev.forcedSkillPositions, [skillId]: positionStr }
      }));
    } else if (umaIndex === 1) {
      setUma2(prev => ({
        ...prev,
        forcedSkillPositions: { ...prev.forcedSkillPositions, [skillId]: positionStr }
      }));
    }
  }, []);

  // Wrap UmaState for RaceTrack compatibility (expects Immutable.js-style API)
  const wrapUmaForRaceTrack = useCallback((uma: UmaState) => ({
    forcedSkillPositions: {
      has: (skillId: string) => skillId in uma.forcedSkillPositions,
      get: (skillId: string) => {
        const pos = uma.forcedSkillPositions[skillId];
        return pos ? parseInt(pos, 10) : undefined;
      }
    }
  }), []);

  const uma1ForTrack = useMemo(() => wrapUmaForRaceTrack(uma1), [uma1, wrapUmaForRaceTrack]);
  const uma2ForTrack = useMemo(() => wrapUmaForRaceTrack(uma2), [uma2, wrapUmaForRaceTrack]);

  return (
    <Language.Provider value="en-global">
      <TourProvider autoStart={true}>
        <IntlProvider definition={STRINGS}>
          <div
            id="app-v2"
            class={`${darkMode ? "" : "light"} ${classicGreen ? "classic-green" : ""} ${showNotification ? "v2-has-notification" : ""}`}
            style={{ '--ui-scale': uiScale / 100 } as any}
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
                  ...presets.map((p) => ({ value: p.id, label: `CM ${p.id} - ${p.name}` })),
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
                    onClick: async () => {
                      const success = await copyShareableUrl({
                        courseId,
                        ground,
                        weather,
                        season,
                        time,
                        samples,
                        uma1,
                        uma2,
                      });
                      if (success) {
                        console.log('[V2] Shareable URL copied to clipboard');
                      }
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
          />

          {/* MAIN CONTENT - RaceTrack takes center stage */}
          <main class="v2-main">
            {mode === "skill" ? (
              <div class="v2-skill-placeholder">
                <div class="v2-skill-placeholder-content">
                  <Zap size={48} />
                  <h2>Skill Mode</h2>
                  <p>To Be Implemented</p>
                </div>
                {/* Ghost UI - faded preview of skill table layout */}
                <div class="v2-skill-ghost">
                  <div class="v2-skill-ghost-header">
                    <div class="v2-skill-ghost-title"></div>
                    <div class="v2-skill-ghost-controls">
                      <div class="v2-skill-ghost-btn"></div>
                      <div class="v2-skill-ghost-btn"></div>
                    </div>
                  </div>
                  <table class="v2-skill-ghost-table">
                    <thead>
                      <tr>
                        <th><div class="v2-skill-ghost-cell wide"></div></th>
                        <th><div class="v2-skill-ghost-cell"></div></th>
                        <th><div class="v2-skill-ghost-cell"></div></th>
                        <th><div class="v2-skill-ghost-cell"></div></th>
                        <th><div class="v2-skill-ghost-cell"></div></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td><div class="v2-skill-ghost-cell wide"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td></tr>
                      <tr><td><div class="v2-skill-ghost-cell wide"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td></tr>
                      <tr><td><div class="v2-skill-ghost-cell wide"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td></tr>
                      <tr><td><div class="v2-skill-ghost-cell wide"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td></tr>
                      <tr><td><div class="v2-skill-ghost-cell wide"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td></tr>
                      <tr><td><div class="v2-skill-ghost-cell wide"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td><td><div class="v2-skill-ghost-cell"></div></td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
            <>
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
                  <label class="v2-switch">
                    <input
                      type="checkbox"
                      checked={showVelocityOverlay}
                      onChange={(e) => setShowVelocityOverlay((e.target as HTMLInputElement).checked)}
                    />
                    <span class="v2-switch-slider" />
                    <span class="v2-switch-label">Velocity</span>
                  </label>
                  <label class="v2-switch">
                    <input
                      type="checkbox"
                      checked={showHpOverlay}
                      onChange={(e) => setShowHpOverlay((e.target as HTMLInputElement).checked)}
                    />
                    <span class="v2-switch-slider" />
                    <span class="v2-switch-label">HP</span>
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
            </>
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
              <button onClick={() => { setUmaDrawerOpen(false); setMobileView('track'); }}>
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
              <button onClick={() => { setSummaryDrawerOpen(false); setMobileView('track'); }}>
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
            <div class="v2-backdrop" onClick={() => { setUmaDrawerOpen(false); setMobileView('track'); }} />
          )}

          {/* Intro video - plays once on first uma selection */}
          {showIntroVideo && umaDrawerOpen && (
            <IntroVideo onClose={() => setShowIntroVideo(false)} />
          )}

          {/* Tour overlay - renders via portal */}
          <TourOverlay />

          {/* Feedback drawer */}
          <FeedbackDrawer
            isOpen={feedbackDrawerOpen}
            onClose={() => { setFeedbackDrawerOpen(false); setMobileView('track'); }}
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
              <div class="v2-backdrop v2-mobile-backdrop" onClick={() => {
                setMobileSettingsOpen(false);
                setMobileView('track');
              }} />
              <div class="v2-mobile-settings open">
                <div class="v2-mobile-settings-header">
                  <h3>Settings</h3>
                  <button type="button" onClick={() => {
                    setMobileSettingsOpen(false);
                    setMobileView('track');
                  }}>
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
                    <div class="v2-mode-toggle" style={{ display: 'flex' }}>
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
                    <div class="v2-mobile-settings-row">
                      <label>Classic Green</label>
                      <label class="v2-switch">
                        <input
                          type="checkbox"
                          checked={classicGreen}
                          onChange={() => setClassicGreen(!classicGreen)}
                        />
                        <span class="v2-switch-slider" />
                      </label>
                    </div>
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
