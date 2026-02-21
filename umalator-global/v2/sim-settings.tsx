/**
 * Simulation Settings Bar
 * Compact inline controls for simulation parameters
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { Shuffle } from 'lucide-react';
import { Tooltip } from './components';

interface SimSettingsProps {
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
}

export function SimulationSettings({
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
}: SimSettingsProps) {
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

				<Tooltip content="Skills check wisdom for activation" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={skillWisdomCheck}
							onChange={() => setSkillWisdomCheck(!skillWisdomCheck)}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Wit Check</span>
					</label>
				</Tooltip>

				<Tooltip content="Enable random rushing/kakari behavior" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={rushedKakari}
							onChange={() => setRushedKakari(!rushedKakari)}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Rush/Kakari</span>
					</label>
				</Tooltip>

				<Tooltip content="Enable spot struggle (position fighting)" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={leadCompetition}
							onChange={() => setLeadCompetition(!leadCompetition)}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Spot Struggle</span>
					</label>
				</Tooltip>

				<Tooltip content="Enable dueling behavior" position="bottom">
					<label class="v2-switch">
						<input
							type="checkbox"
							checked={competeFight}
							onChange={() => setCompeteFight(!competeFight)}
						/>
						<span class="v2-switch-slider" />
						<span class="v2-switch-label">Dueling</span>
					</label>
				</Tooltip>
			</div>
		</div>
	);
}
