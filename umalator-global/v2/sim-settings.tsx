/**
 * Simulation Settings Bar
 * Compact inline controls for simulation parameters
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Shuffle, Dices, Settings2, RotateCcw } from 'lucide-react';
import { Tooltip } from './components';
import type { DuelingRates } from './simulation-utils';

const DEFAULT_DUELING_RATES: DuelingRates = {
	runaway: 10, frontRunner: 20, paceChaser: 30, lateSurger: 35, endCloser: 35,
};

// Front Runner (Nige) and Runaway (Oonige) are both early-returned by the
// solver's dueling check, so we don't render rows for them.
const STRATEGY_ROWS: Array<{ key: keyof DuelingRates; label: string; sub?: string }> = [
	{ key: 'runaway',     label: 'Runaway',      sub: 'Oonige' },
	{ key: 'frontRunner', label: 'Front Runner', sub: 'Nige' },
	{ key: 'paceChaser',  label: 'Pace Chaser',  sub: 'Senkou' },
	{ key: 'lateSurger',  label: 'Late Surger',  sub: 'Sashi' },
	{ key: 'endCloser',   label: 'End Closer',   sub: 'Oikomi' },
];

export type SimEngine = 'v1' | 'v2';

interface SimSettingsProps {
	engine: SimEngine;
	setEngine: (v: SimEngine) => void;
	samples: number;
	setSamples: (v: number) => void;
	seed: number;
	setSeed: (v: number) => void;
	syncRng: boolean;
	setSyncRng: (v: boolean) => void;
	skillWisdomCheck: boolean;
	setSkillWisdomCheck: (v: boolean) => void;
	rushedKakari: boolean;
	setRushedKakari: (v: boolean) => void;
	leadCompetition: boolean;
	setLeadCompetition: (v: boolean) => void;
	competeFight: boolean;
	setCompeteFight: (v: boolean) => void;
	duelingRates: DuelingRates;
	setDuelingRates: (v: DuelingRates) => void;
	laneMovement: boolean;
	setLaneMovement: (v: boolean) => void;
	autoSeed: boolean;
	setAutoSeed: (v: boolean) => void;
	hideNotInGame: boolean;
	setHideNotInGame: (v: boolean) => void;
	mode?: string;
}

export function SimulationSettings({
	engine,
	setEngine,
	samples,
	setSamples,
	seed,
	setSeed,
	syncRng,
	setSyncRng,
	skillWisdomCheck,
	setSkillWisdomCheck,
	rushedKakari,
	setRushedKakari,
	leadCompetition,
	setLeadCompetition,
	competeFight,
	setCompeteFight,
	duelingRates,
	setDuelingRates,
	laneMovement,
	setLaneMovement,
	autoSeed,
	setAutoSeed,
	hideNotInGame,
	setHideNotInGame,
	mode,
}: SimSettingsProps) {
	// Dueling rates popover
	const [ratesOpen, setRatesOpen] = useState(false);
	const ratesTriggerRef = useRef<HTMLButtonElement>(null);
	const ratesMenuRef = useRef<HTMLDivElement>(null);
	const [ratesPos, setRatesPos] = useState<{ top: number; left: number } | null>(null);

	useEffect(() => {
		if (!ratesOpen || !ratesTriggerRef.current) return;
		const rect = ratesTriggerRef.current.getBoundingClientRect();
		setRatesPos({ top: rect.bottom + 6, left: rect.left });
	}, [ratesOpen]);

	useEffect(() => {
		if (!ratesOpen) return;
		const close = (e: Event) => {
			const t = e.target as Node;
			if (ratesMenuRef.current?.contains(t)) return;
			if (ratesTriggerRef.current?.contains(t)) return;
			setRatesOpen(false);
		};
		document.addEventListener('pointerdown', close);
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setRatesOpen(false); };
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', close);
			document.removeEventListener('keydown', esc);
		};
	}, [ratesOpen]);

	const updateRate = (key: keyof DuelingRates, value: number) => {
		const v = Math.max(0, Math.min(100, Math.round(value)));
		setDuelingRates({ ...duelingRates, [key]: v });
	};

	const handleSamplesChange = (e: Event) => {
		const val = parseInt((e.target as HTMLInputElement).value) || 500;
		setSamples(Math.max(1, Math.min(10000, val)));
	};

	const handleSeedChange = (e: Event) => {
		const val = parseInt((e.target as HTMLInputElement).value) || 0;
		setSeed(val);
	};

	const randomizeSeed = () => {
		setSeed(Math.floor(Math.random() * 0xFFFFFFFF));
	};

	return (
		<div class="v2-sim-settings">
			<div class="v2-sim-settings-group">
				<label class="v2-sim-label">
					Samples
					<input
						type="number"
						class="v2-sim-input"
						value={samples}
						onInput={handleSamplesChange}
						min={1}
						max={10000}
					/>
				</label>
			</div>

			<div class="v2-sim-settings-group">
				<label class="v2-sim-label">
					Seed
					<div class="v2-sim-seed-row">
						<input
							type="number"
							class="v2-sim-input v2-sim-seed-input"
							value={seed}
							onInput={handleSeedChange}
						/>
						<Tooltip content="Randomize seed" position="bottom">
							<button
								type="button"
								class="v2-sim-seed-btn"
								onClick={randomizeSeed}
							>
								<Shuffle size={14} />
							</button>
						</Tooltip>
						<Tooltip content="Auto-reroll seed on every run" position="bottom">
							<button
								type="button"
								class={`v2-sim-seed-btn ${autoSeed ? 'active' : ''}`}
								onClick={() => setAutoSeed(!autoSeed)}
							>
								<Dices size={14} />
							</button>
						</Tooltip>
					</div>
				</label>
			</div>

			<div class="v2-sim-divider" />

			<div class="v2-sim-toggles">
				<Tooltip content="Use same RNG sequence for both Uma" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={syncRng}
							onChange={() => setSyncRng(!syncRng)}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Sync RNG</span>
					</label>
				</Tooltip>

				{/* Engine v1 is alpha123's published solver, vendored verbatim (see
				    tools/sync-upstream-engine.mjs); v2 is ours. Rush, dueling, lead competition
				    and lane movement exist only in v2, so they disable under v1 rather than
				    silently doing nothing. */}
				<Tooltip content="v2 is our engine. v1 is alpha123's upstream engine — fewer mechanics, useful as a reference point." position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={engine === 'v2'}
							onChange={() => setEngine(engine === 'v2' ? 'v1' : 'v2')}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Engine {engine}</span>
					</label>
				</Tooltip>

				<Tooltip content={mode === "stamina" ? "Always enabled in Stamina mode" : "Skills check wisdom for activation"} position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={skillWisdomCheck}
							onChange={() => setSkillWisdomCheck(!skillWisdomCheck)}
							disabled={mode === "stamina"}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Wit Check</span>
					</label>
				</Tooltip>

				<Tooltip content="Enable random rushing/kakari behavior" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={rushedKakari && engine === 'v2'}
							onChange={() => setRushedKakari(!rushedKakari)}
							disabled={engine === 'v1'}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Rush/Kakari</span>
					</label>
				</Tooltip>

				<Tooltip content="Enable spot struggle (position fighting)" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={leadCompetition && engine === 'v2'}
							onChange={() => setLeadCompetition(!leadCompetition)}
							disabled={engine === 'v1'}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Spot Struggle</span>
					</label>
				</Tooltip>

				<div class="v2-dueling-control">
					<Tooltip content="Enable dueling behavior" position="bottom">
						<label class="v2-switch">
							<input
								type="checkbox"
								checked={competeFight && engine === 'v2'}
								onChange={() => setCompeteFight(!competeFight)}
								disabled={engine === 'v1'}
							/>
							<span class="v2-switch-slider" />
							<span class="v2-switch-label">Dueling</span>
						</label>
					</Tooltip>
					<Tooltip content="Edit per-strategy dueling rates" position="bottom">
						<button
							ref={ratesTriggerRef}
							type="button"
							class={`v2-dueling-rates-btn ${ratesOpen ? 'open' : ''}`}
							disabled={!competeFight}
							onClick={() => setRatesOpen(o => !o)}
							aria-label="Edit dueling rates"
							aria-expanded={ratesOpen}
						>
							<Settings2 size={12} />
						</button>
					</Tooltip>
					{ratesOpen && ratesPos && createPortal(
						<div
							ref={ratesMenuRef}
							class="v2-dueling-rates-popover"
							style={{ position: 'fixed', top: `${ratesPos.top}px`, left: `${ratesPos.left}px` }}
							role="dialog"
							aria-label="Dueling rates"
						>
							<div class="v2-dueling-rates-header">
								<span class="v2-dueling-rates-title">Dueling rates</span>
								<button
									type="button"
									class="v2-dueling-rates-reset"
									title="Restore canonical defaults"
									onClick={() => setDuelingRates(DEFAULT_DUELING_RATES)}
								>
									<RotateCcw size={11} /> Reset
								</button>
							</div>
							<div class="v2-dueling-rates-rows">
								{STRATEGY_ROWS.map(row => {
									const value = duelingRates[row.key];
									return (
										<div class="v2-dueling-rates-row" key={row.key}>
											<label class="v2-dueling-rates-label">
												<span>{row.label}</span>
												{row.sub && <em>{row.sub}</em>}
											</label>
											<div class="v2-dueling-rates-input">
												<input
													type="range"
													min="0" max="100" step="1"
													value={value}
													onInput={e => updateRate(row.key, parseInt((e.target as HTMLInputElement).value))}
												/>
												<input
													type="number"
													min="0" max="100"
													value={value}
													onInput={e => updateRate(row.key, parseInt((e.target as HTMLInputElement).value || '0'))}
													class="v2-dueling-rates-num"
												/>
												<span class="v2-dueling-rates-pct">%</span>
											</div>
										</div>
									);
								})}
							</div>
							<p class="v2-dueling-rates-hint">
								Per-strategy chance to engage in a duel on the final straight.
								Settings persist locally.
							</p>
						</div>,
						document.body
					)}
				</div>

				<Tooltip content="Enable lane movement simulation" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={laneMovement && engine === 'v2'}
							onChange={() => setLaneMovement(!laneMovement)}
							disabled={engine === 'v1'}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Lane Movement</span>
					</label>
				</Tooltip>

				<Tooltip content="Only show skills and outfits currently in the Global game" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={hideNotInGame}
							onChange={() => setHideNotInGame(!hideNotInGame)}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">In-Game Only</span>
					</label>
				</Tooltip>
			</div>
		</div>
	);
}
