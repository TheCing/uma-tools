/**
 * HP Calculator App
 *
 * A precision utility for calculating Uma Musume stamina requirements.
 */

import { h, render, Fragment } from "preact";
import { useState, useEffect, useMemo } from "preact/hooks";
import {
  Zap,
  Sun,
  Moon,
  ChevronDown,
  Check,
  X,
  Activity,
  Gauge,
  Heart,
  Flame,
  Target,
  Lightbulb,
  BookOpen,
  Menu,
  Calculator,
  Calendar,
  Book,
} from "lucide-react";

import {
  calculateEstimate,
  getStrategyName,
  STRATEGIES,
  getCourse,
  getTrackList,
  coursesByTrack,
  getCourseLabel,
  type Locale,
  type Strategy,
  type HpEstimate,
} from "./calculations";

import "./hp-calculator.css";

// Storage keys
const STORAGE_KEY = "hp-calculator-state";
const PREFS_KEY = "hp-calculator-prefs";

interface AppState {
  courseId: string;
  stamina: number;
  guts: number;
  speed: number;
  wisdom: number;
  healPercent: number;
  strategy: Strategy;
  showComparison: boolean;
}

interface Preferences {
  darkMode: boolean;
  locale: Locale;
}

const DEFAULT_STATE: AppState = {
  courseId: "10914", // Hanshin 3200m
  stamina: 1200,
  guts: 1000,
  speed: 1200,
  wisdom: 1200,
  healPercent: 0,
  strategy: "sashi",
  showComparison: false,
};

const DEFAULT_PREFS: Preferences = {
  darkMode: true,
  locale: "gl",
};

// Load state from localStorage
function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_STATE, ...parsed };
    }
  } catch (e) {
    console.warn("Failed to load state:", e);
  }
  return DEFAULT_STATE;
}

function loadPrefs(): Preferences {
  try {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_PREFS, ...parsed };
    }
  } catch (e) {
    console.warn("Failed to load prefs:", e);
  }
  return DEFAULT_PREFS;
}

// Stat icons (using status icons from game)
const STAT_ICONS: Record<string, string> = {
  speed: "/uma-tools/icons/status_00.png",
  stamina: "/uma-tools/icons/status_01.png",
  power: "/uma-tools/icons/status_02.png",
  guts: "/uma-tools/icons/status_03.png",
  wisdom: "/uma-tools/icons/status_04.png",
};

function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs);
  const [appsMenuOpen, setAppsMenuOpen] = useState(false);
  const trackId = useMemo(() => {
    const course = getCourse(state.courseId);
    return course?.raceTrackId ?? 10009;
  }, [state.courseId]);

  // Save state to localStorage (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 300);
    return () => clearTimeout(timeout);
  }, [state]);

  // Save prefs immediately
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Apply theme class
  useEffect(() => {
    document.body.classList.toggle("light", !prefs.darkMode);
  }, [prefs.darkMode]);

  // Calculate results
  const estimate = useMemo(() => {
    return calculateEstimate(
      state.courseId,
      state.stamina,
      state.guts,
      state.strategy,
      state.speed,
      state.healPercent,
      state.wisdom,
    );
  }, [
    state.courseId,
    state.stamina,
    state.guts,
    state.strategy,
    state.speed,
    state.healPercent,
    state.wisdom,
  ]);

  // Calculate comparison for all strategies
  const comparison = useMemo(() => {
    return STRATEGIES.map((strat) => {
      const est = calculateEstimate(
        state.courseId,
        state.stamina,
        state.guts,
        strat,
        state.speed,
        state.healPercent,
        state.wisdom,
      );
      return {
        strategy: strat,
        estimate: est,
      };
    });
  }, [
    state.courseId,
    state.stamina,
    state.guts,
    state.speed,
    state.healPercent,
    state.wisdom,
  ]);

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const toggleTheme = () => {
    setPrefs((prev) => ({ ...prev, darkMode: !prev.darkMode }));
  };

  const setLocale = (locale: Locale) => {
    setPrefs((prev) => ({ ...prev, locale }));
  };

  return (
    <>
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <Zap size={20} />
          HP Calculator
        </div>
        <div className="header-controls">
          {/* Locale toggle */}
          <div className="locale-toggle">
            <button
              className={`locale-btn ${prefs.locale === "gl" ? "active" : ""}`}
              onClick={() => setLocale("gl")}
            >
              GL
            </button>
            <button
              className={`locale-btn ${prefs.locale === "jp" ? "active" : ""}`}
              onClick={() => setLocale("jp")}
            >
              JP
            </button>
          </div>

          {/* Theme toggle */}
          <button
            className="btn btn-icon btn-ghost"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            {prefs.darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Apps dropdown */}
          <div className="apps-dropdown">
            <button
              className="btn btn-icon btn-ghost"
              onClick={() => setAppsMenuOpen(!appsMenuOpen)}
              title="More apps"
            >
              <Menu size={18} />
            </button>
            {appsMenuOpen && (
              <>
                <div
                  className="apps-dropdown-backdrop"
                  onClick={() => setAppsMenuOpen(false)}
                />
                <div className="apps-dropdown-menu">
                  <a
                    href="/umalator-global/"
                    className="apps-dropdown-item"
                    onClick={() => setAppsMenuOpen(false)}
                  >
                    <Calculator size={16} />
                    Umalator
                  </a>
                  <a
                    href="/events/"
                    className="apps-dropdown-item"
                    onClick={() => setAppsMenuOpen(false)}
                  >
                    <Calendar size={16} />
                    Events
                  </a>
                  <a
                    href="/docs/"
                    className="apps-dropdown-item"
                    onClick={() => setAppsMenuOpen(false)}
                  >
                    <Book size={16} />
                    Docs
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="main">
        <div className="main-wrapper">
          {/* Sidebar guide */}
          <aside className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-title">
                <BookOpen size={14} />
                How to Use
              </div>

              <div className="sidebar-step">
                <span className="step-number">1</span>
                <div className="step-content">
                  <h4>Select a Course</h4>
                  <p>
                    Select a track, then choose a course distance. Distance
                    affects HP requirements.
                  </p>
                </div>
              </div>

              <div className="sidebar-step">
                <span className="step-number">2</span>
                <div className="step-content">
                  <h4>Enter Your Stats</h4>
                  <p>
                    Input your uma's Speed, Stamina, and Guts. These determine
                    max HP and consumption rate.
                  </p>
                </div>
              </div>

              <div className="sidebar-step">
                <span className="step-number">3</span>
                <div className="step-content">
                  <h4>Set Heal %</h4>
                  <p>
                    Add total healing from skills (e.g., two gold heals = ~11%).
                    This extends your effective HP.
                  </p>
                </div>
              </div>

              <div className="sidebar-step">
                <span className="step-number">4</span>
                <div className="step-content">
                  <h4>Check Results</h4>
                  <p>
                    See if you can full spurt. Green surplus = safe. The "Min
                    Stamina" shows the threshold.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* Calculator content */}
          <div className="content-area">
            <div className="calculator-container">
              {/* Course & Strategy Card */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Race Configuration</span>
                </div>

                {/* Course selector - two dropdowns */}
                <div
                  className="form-group"
                  style={{ marginBottom: "var(--space-lg)" }}
                >
                  <label className="form-label">
                    <Target size={14} />
                    Course
                  </label>
                  <div className="course-select-row">
                    <div className="select-wrapper" style={{ flex: 1 }}>
                      <select
                        className="select"
                        value={trackId}
                        onChange={(e) => {
                          const newTrackId = +(e.target as HTMLSelectElement)
                            .value;
                          const firstCourse = coursesByTrack[newTrackId]?.[0];
                          if (firstCourse) {
                            updateState({ courseId: firstCourse });
                          }
                        }}
                      >
                        {getTrackList(prefs.locale).map((track) => (
                          <option key={track.id} value={track.id}>
                            {track.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="select-chevron" />
                    </div>
                    <div className="select-wrapper" style={{ flex: 1 }}>
                      <select
                        className="select"
                        value={state.courseId}
                        onChange={(e) =>
                          updateState({
                            courseId: (e.target as HTMLSelectElement).value,
                          })
                        }
                      >
                        {(coursesByTrack[trackId] || []).map((cid) => (
                          <option key={cid} value={cid}>
                            {getCourseLabel(cid, prefs.locale)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="select-chevron" />
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div
                  className="stats-grid"
                  style={{ marginBottom: "var(--space-lg)" }}
                >
                  <div className="stat-input-group">
                    <label className="stat-label">
                      <img
                        src={STAT_ICONS.speed}
                        alt=""
                        className="stat-icon"
                      />
                      Speed
                    </label>
                    <input
                      type="number"
                      className="input-number"
                      value={state.speed}
                      min={1}
                      max={2000}
                      onChange={(e) =>
                        updateState({
                          speed:
                            parseInt((e.target as HTMLInputElement).value) ||
                            1200,
                        })
                      }
                    />
                  </div>

                  <div className="stat-input-group">
                    <label className="stat-label">
                      <img
                        src={STAT_ICONS.stamina}
                        alt=""
                        className="stat-icon"
                      />
                      Stamina
                    </label>
                    <input
                      type="number"
                      className="input-number"
                      value={state.stamina}
                      min={1}
                      max={2000}
                      onChange={(e) =>
                        updateState({
                          stamina:
                            parseInt((e.target as HTMLInputElement).value) ||
                            1200,
                        })
                      }
                    />
                  </div>

                  <div className="stat-input-group">
                    <label className="stat-label">
                      <img src={STAT_ICONS.guts} alt="" className="stat-icon" />
                      Guts
                    </label>
                    <input
                      type="number"
                      className="input-number"
                      value={state.guts}
                      min={1}
                      max={2000}
                      onChange={(e) =>
                        updateState({
                          guts:
                            parseInt((e.target as HTMLInputElement).value) ||
                            1000,
                        })
                      }
                    />
                  </div>

                  <div className="stat-input-group">
                    <label className="stat-label">
                      <img
                        src={STAT_ICONS.wisdom}
                        alt=""
                        className="stat-icon"
                      />
                      Wit
                    </label>
                    <input
                      type="number"
                      className="input-number"
                      value={state.wisdom}
                      min={1}
                      max={2000}
                      onChange={(e) =>
                        updateState({
                          wisdom:
                            parseInt((e.target as HTMLInputElement).value) ||
                            1200,
                        })
                      }
                    />
                  </div>

                  <div className="stat-input-group">
                    <label className="stat-label">
                      <Heart size={14} style={{ opacity: 0.7 }} />
                      Heal %
                    </label>
                    <input
                      type="number"
                      className="input-number"
                      value={state.healPercent}
                      min={0}
                      max={100}
                      step={0.5}
                      onChange={(e) =>
                        updateState({
                          healPercent:
                            parseFloat((e.target as HTMLInputElement).value) ||
                            0,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Strategy selector */}
                <div className="form-group">
                  <label className="form-label">
                    <Activity size={14} />
                    Strategy
                  </label>
                  <div className="select-wrapper">
                    <select
                      className="select"
                      value={state.strategy}
                      onChange={(e) =>
                        updateState({
                          strategy: (e.target as HTMLSelectElement)
                            .value as Strategy,
                        })
                      }
                    >
                      {STRATEGIES.map((strat) => (
                        <option key={strat} value={strat}>
                          {getStrategyName(strat, prefs.locale)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="select-chevron" />
                  </div>
                </div>
              </div>

              {/* Results Card */}
              {estimate && (
                <div className="card results-card">
                  <div className="results-header">
                    <Gauge size={18} />
                    <h2>Results</h2>
                  </div>

                  <div className="results-grid">
                    <div className="result-row">
                      <span className="result-label">Max HP</span>
                      <span className="result-value mono">
                        {estimate.maxHp.toLocaleString()}
                      </span>
                    </div>

                    <div className="result-row">
                      <span className="result-label">Total Needed</span>
                      <span className="result-value mono">
                        {estimate.totalHpNeeded.toLocaleString()}
                      </span>
                    </div>

                    <div className="result-row">
                      <span className="result-label">Phase 0+1</span>
                      <span className="result-value">
                        <span className="mono">
                          {estimate.phase01Hp.toLocaleString()}
                        </span>
                        <span className="result-note">(first 2/3)</span>
                      </span>
                    </div>

                    <div className="result-row">
                      <span className="result-label">Phase 2 (Spurt)</span>
                      <span className="result-value">
                        <span className="mono">
                          {estimate.phase2Hp.toLocaleString()}
                        </span>
                        <span className="result-note">(last 1/3)</span>
                      </span>
                    </div>

                    <div className="results-divider" />

                    <div className="result-highlight">
                      <span className="result-highlight-label">HP Surplus</span>
                      <span
                        className={`result-highlight-value ${estimate.canFullSpurt ? "success" : "error"}`}
                      >
                        {estimate.hpSurplus >= 0 ? "+" : ""}
                        {estimate.hpSurplus.toLocaleString()}
                      </span>
                    </div>

                    <div className="result-highlight">
                      <span className="result-highlight-label">Full Spurt</span>
                      <div
                        className={`spurt-indicator ${estimate.canFullSpurt ? "success" : "failure"}`}
                      >
                        {estimate.canFullSpurt ? <Check /> : <X />}
                        {estimate.canFullSpurt ? "YES" : "NO"}
                      </div>
                    </div>

                    <div className="min-stamina-row">
                      <span className="min-stamina-label">
                        Min Stamina for Full Spurt
                        {state.healPercent > 0 && (
                          <span className="result-note">
                            {" "}
                            (with {state.healPercent}% heal)
                          </span>
                        )}
                      </span>
                      <span className="min-stamina-value">
                        {estimate.minStaminaForFullSpurt.toLocaleString()}
                      </span>
                    </div>

                    {/* Downhill Mode results */}
                    {estimate.downhillDistance > 0 && (
                      <>
                        <div className="downhill-section-header">
                          Downhill Mode (Expected)
                        </div>

                        <div className="downhill-stats-bar">
                          <span>{estimate.downhillDistance}m downhill ({estimate.downhillPercent}% of course)</span>
                          <span>DH Rate: {estimate.expectedDownhillModePercent}%</span>
                        </div>

                        <div className="result-row">
                          <span className="result-label">HP Savings</span>
                          <span className="result-value mono">
                            {estimate.downhillHpSavings.toLocaleString()}
                          </span>
                        </div>

                        <div className="result-row">
                          <span className="result-label">Adjusted HP Needed</span>
                          <span className="result-value mono">
                            {estimate.adjustedTotalHpNeeded.toLocaleString()}
                          </span>
                        </div>

                        <div className="result-highlight">
                          <span className="result-highlight-label">Surplus (w/ DH)</span>
                          <span
                            className={`result-highlight-value ${estimate.adjustedCanFullSpurt ? "success" : "error"}`}
                          >
                            {estimate.adjustedHpSurplus >= 0 ? "+" : ""}
                            {estimate.adjustedHpSurplus.toLocaleString()}
                          </span>
                        </div>

                        <div className="result-highlight">
                          <span className="result-highlight-label">Full Spurt (w/ DH)</span>
                          <div
                            className={`spurt-indicator ${estimate.adjustedCanFullSpurt ? "success" : "failure"}`}
                          >
                            {estimate.adjustedCanFullSpurt ? <Check /> : <X />}
                            {estimate.adjustedCanFullSpurt ? "YES" : "NO"}
                          </div>
                        </div>

                        <div className="min-stamina-row downhill-min-stamina">
                          <span className="min-stamina-label">
                            Min Stamina (w/ DH)
                            {state.healPercent > 0 && (
                              <span className="result-note">
                                {" "}(with {state.healPercent}% heal)
                              </span>
                            )}
                          </span>
                          <span className="min-stamina-value">
                            {estimate.adjustedMinStamina.toLocaleString()}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Strategy Comparison */}
              <div className="comparison-section">
                <div
                  className="comparison-header"
                  onClick={() =>
                    updateState({ showComparison: !state.showComparison })
                  }
                >
                  <h3>
                    <Flame size={16} />
                    Compare All Strategies
                  </h3>
                  <ChevronDown
                    size={18}
                    className={`comparison-chevron ${state.showComparison ? "open" : ""}`}
                  />
                </div>

                <div
                  className={`comparison-table-wrapper ${state.showComparison ? "open" : ""}`}
                >
                  {(() => {
                    const hasDH = comparison[0]?.estimate?.downhillDistance > 0;
                    return (
                      <table className="comparison-table">
                        <thead>
                          <tr>
                            <th>Strategy</th>
                            <th>Max HP</th>
                            <th>Surplus</th>
                            <th>Spurt</th>
                            {hasDH && <th className="dh-col">w/ DH</th>}
                            {hasDH && <th className="dh-col">Spurt</th>}
                            <th>Min Stam</th>
                            {hasDH && <th className="dh-col">w/ DH</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.map(({ strategy, estimate: est }) => (
                            <tr
                              key={strategy}
                              className={
                                strategy === state.strategy ? "highlight-row" : ""
                              }
                            >
                              <td>{getStrategyName(strategy, prefs.locale)}</td>
                              <td>{est?.maxHp.toLocaleString() ?? "-"}</td>
                              <td>
                                {est
                                  ? `${est.hpSurplus >= 0 ? "+" : ""}${est.hpSurplus.toLocaleString()}`
                                  : "-"}
                              </td>
                              <td
                                className={
                                  est?.canFullSpurt ? "spurt-yes" : "spurt-no"
                                }
                              >
                                {est?.canFullSpurt ? (
                                  <Check size={16} />
                                ) : (
                                  <X size={16} />
                                )}
                              </td>
                              {hasDH && (
                                <td className={`dh-col ${est?.adjustedCanFullSpurt ? "spurt-yes" : "spurt-no"}`}>
                                  {est
                                    ? `${est.adjustedHpSurplus >= 0 ? "+" : ""}${est.adjustedHpSurplus.toLocaleString()}`
                                    : "-"}
                                </td>
                              )}
                              {hasDH && (
                                <td
                                  className={`dh-col ${est?.adjustedCanFullSpurt ? "spurt-yes" : "spurt-no"}`}
                                >
                                  {est?.adjustedCanFullSpurt ? (
                                    <Check size={16} />
                                  ) : (
                                    <X size={16} />
                                  )}
                                </td>
                              )}
                              <td>
                                {est?.minStaminaForFullSpurt.toLocaleString() ??
                                  "-"}
                              </td>
                              {hasDH && (
                                <td className="dh-col">
                                  {est?.adjustedMinStamina.toLocaleString() ?? "-"}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar - formulas & tips */}
          <aside className="sidebar">
            <div className="sidebar-tip">
              <div className="sidebar-tip-title">
                <Lightbulb size={14} />
                Key Formulas
              </div>
              <p>
                Max HP depends on stamina, distance, and strategy coefficient.
              </p>
              <div className="sidebar-formula">
                MaxHP = 0.8 × Coef × Stam + Dist
              </div>
              <p style={{ marginTop: "var(--space-sm)" }}>
                Guts reduces HP consumption during spurt phase.
              </p>
              <div className="sidebar-formula">
                GutsMod = 1 + 200/√(600×Guts)
              </div>
            </div>

            <div className="sidebar-tip">
              <div className="sidebar-tip-title">
                <Lightbulb size={14} />
                Strategy Coefficients
              </div>
              <p>Higher coefficient = more max HP:</p>
              <div className="sidebar-formula">
                Late Surger: 1.000 (best)
                <br />
                End Closer: 0.995
                <br />
                Front Runner: 0.950
                <br />
                Pace Chaser: 0.890
                <br />
                Runaway: 0.860
              </div>
            </div>

            <div className="sidebar-tip">
              <div className="sidebar-tip-title">
                <Lightbulb size={14} />
                Limitations
              </div>
              <p>
                This calculator provides <strong>analytical estimates</strong>{" "}
                assuming ideal conditions. Downhill Mode uses the Markov
                steady-state model. It does not account for:
              </p>
              <ul className="sidebar-list">
                <li>Position Keep variations</li>
                <li>Kakari (rushed) state</li>
                <li>Skill activation timing</li>
              </ul>
              <p style={{ marginTop: "var(--space-sm)" }}>
                For accurate survival/spurt rates that include these factors,
                use the <a href="/umalator-global/">Umalator simulator</a> which
                runs Monte Carlo simulations.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>
          Licensed under{" "}
          <a
            href="https://www.gnu.org/licenses/gpl-3.0.html"
            target="_blank"
            rel="noopener"
          >
            GPL-3.0
          </a>
          .&nbsp; Credit to the original authors: &nbsp;
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
        <div className="footer-links">
          <a href="/umalator-global/">Umalator</a>
          &nbsp;|&nbsp;
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
        </div>
      </footer>
    </>
  );
}

render(<App />, document.getElementById("app")!);
