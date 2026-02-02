import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

import './RacetrackCow.css';

type CowState = 'walk' | 'idle' | 'sleep';
type CowDirection = 'left' | 'right';

interface RacetrackCowProps {
	trackWidth: number;
}

const COW_SIZE = 32; // Display size in pixels
const WALK_SPEED = 0.02; // Pixels per ms
const FRAME_INTERVAL = 150; // ms between animation frames

// MooCoin config
const MOOCOIN_STORAGE_KEY = 'moomoocord_moocoins';
const MICROCOIN_PER_COIN = 300000; // ~5 minutes of walking at 1 microcoin per ms
const MOO_SOUND_ENABLED_KEY = 'moomoocord_moo_sound';

// Sprite sheet config (same as demo)
const SPRITE_CONFIG = {
	idle: { src: '/uma-tools/icons/cow/White_Cow_Idle.png', frames: 6, width: 384, height: 256 },
	walk: { src: '/uma-tools/icons/cow/White_Cow_Walk.png', frames: 4, width: 256, height: 256 },
	sleep: { src: '/uma-tools/icons/cow/White_Cow_Sleeping.png', frames: 4, width: 256, height: 256 },
};

// Direction to sprite row mapping
const DIRECTION_ROW = { back: 0, front: 1, left: 2, right: 3 };

// MooCoin localStorage helpers
function loadMooCoins(): { coins: number; microCoins: number } {
	try {
		const stored = localStorage.getItem(MOOCOIN_STORAGE_KEY);
		if (stored) {
			const data = JSON.parse(stored);
			return {
				coins: typeof data.coins === 'number' ? data.coins : 0,
				microCoins: typeof data.microCoins === 'number' ? data.microCoins : 0,
			};
		}
	} catch (e) {
		console.error('Failed to load MooCoins:', e);
	}
	return { coins: 0, microCoins: 0 };
}

function saveMooCoins(coins: number, microCoins: number): void {
	try {
		localStorage.setItem(MOOCOIN_STORAGE_KEY, JSON.stringify({ coins, microCoins }));
	} catch (e) {
		console.error('Failed to save MooCoins:', e);
	}
}

function isMooSoundEnabled(): boolean {
	try {
		return localStorage.getItem(MOO_SOUND_ENABLED_KEY) !== 'false';
	} catch {
		return true;
	}
}

function setMooSoundEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(MOO_SOUND_ENABLED_KEY, String(enabled));
	} catch (e) {
		// Ignore
	}
}

// Confetti particle
interface ConfettiParticle {
	id: number;
	x: number;
	y: number;
	color: string;
	rotation: number;
	scale: number;
}

// Floating coin animation
interface FloatingCoin {
	id: number;
	x: number;
	startTime: number;
}

export function RacetrackCow({ trackWidth }: RacetrackCowProps) {
	// Use refs for animation state to avoid re-creating animation loop
	const positionRef = useRef(Math.random() * (trackWidth - COW_SIZE * 3) + COW_SIZE); // Account for 3x scale
	const directionRef = useRef<CowDirection>(Math.random() > 0.5 ? 'right' : 'left');
	const stateRef = useRef<CowState>('walk');
	const frameRef = useRef(0);

	// React state for rendering
	const [renderTick, setRenderTick] = useState(0);
	const [visible, setVisible] = useState(true);

	// MooCoin state
	const savedCoins = useRef(loadMooCoins());
	const [mooCoins, setMooCoins] = useState(savedCoins.current.coins);
	const microCoinsRef = useRef(savedCoins.current.microCoins);
	const [floatingCoins, setFloatingCoins] = useState<FloatingCoin[]>([]);
	const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
	const [mooSoundOn, setMooSoundOn] = useState(isMooSoundEnabled);
	const floatingCoinIdRef = useRef(0);
	const confettiIdRef = useRef(0);
	const lastSaveRef = useRef(Date.now());

	const stateTimerRef = useRef<number | null>(null);
	const animationRef = useRef<number | null>(null);

	// Moo sound audio element (lazy loaded)
	const mooAudioRef = useRef<HTMLAudioElement | null>(null);

	// Play moo sound
	const playMoo = useCallback(() => {
		if (!mooSoundOn) return;
		if (!mooAudioRef.current) {
			mooAudioRef.current = new Audio('/uma-tools/icons/cow/moo.mp3');
			mooAudioRef.current.volume = 0.3;
		}
		mooAudioRef.current.currentTime = 0;
		mooAudioRef.current.play().catch(() => {});
	}, [mooSoundOn]);

	// Spawn confetti burst
	const spawnConfetti = useCallback((x: number) => {
		const colors = ['#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96E6A1'];
		const particles: ConfettiParticle[] = [];
		for (let i = 0; i < 12; i++) {
			particles.push({
				id: confettiIdRef.current++,
				x: x + (Math.random() - 0.5) * 60,
				y: 80 + (Math.random() - 0.5) * 40,
				color: colors[Math.floor(Math.random() * colors.length)],
				rotation: Math.random() * 360,
				scale: 0.5 + Math.random() * 0.5,
			});
		}
		setConfetti(particles);
		// Clear after animation
		setTimeout(() => setConfetti([]), 1500);
	}, []);

	// Award a MooCoin
	const awardCoin = useCallback((cowX: number) => {
		setMooCoins(prev => {
			const newTotal = prev + 1;
			saveMooCoins(newTotal, microCoinsRef.current);
			return newTotal;
		});

		// Spawn floating +1 coin
		setFloatingCoins(prev => [...prev, {
			id: floatingCoinIdRef.current++,
			x: cowX,
			startTime: Date.now(),
		}]);

		// Confetti burst
		spawnConfetti(cowX);

		// Play moo
		playMoo();

		// Clean up floating coin after animation
		setTimeout(() => {
			setFloatingCoins(prev => prev.slice(1));
		}, 1500);
	}, [spawnConfetti, playMoo]);

	// Toggle moo sound
	const toggleMooSound = useCallback(() => {
		setMooSoundOn(prev => {
			const newVal = !prev;
			setMooSoundEnabled(newVal);
			return newVal;
		});
	}, []);

	// Get random duration for current state
	const getStateDuration = (cowState: CowState) => {
		switch (cowState) {
			case 'walk': return 3000 + Math.random() * 8000; // 3-11 seconds
			case 'idle': return 2000 + Math.random() * 4000; // 2-6 seconds
			case 'sleep': return 5000 + Math.random() * 10000; // 5-15 seconds
		}
	};

	// Pick next state randomly
	const pickNextState = (): CowState => {
		const rand = Math.random();
		if (rand < 0.6) return 'walk';
		if (rand < 0.85) return 'idle';
		return 'sleep';
	};

	// Schedule next state change
	const scheduleStateChange = useCallback(() => {
		if (stateTimerRef.current) {
			clearTimeout(stateTimerRef.current);
		}

		const duration = getStateDuration(stateRef.current);
		stateTimerRef.current = window.setTimeout(() => {
			const nextState = pickNextState();
			stateRef.current = nextState;
			frameRef.current = 0;

			// Maybe change direction when starting to walk
			if (nextState === 'walk' && Math.random() > 0.7) {
				directionRef.current = directionRef.current === 'left' ? 'right' : 'left';
			}

			// Schedule next change
			scheduleStateChange();
		}, duration);
	}, []);

	// Animation loop - runs continuously, reads from refs
	useEffect(() => {
		let lastFrameTime = 0;
		let lastMoveTime = 0;

		const animate = (timestamp: number) => {
			if (lastMoveTime === 0) lastMoveTime = timestamp;
			if (lastFrameTime === 0) lastFrameTime = timestamp;

			let needsRender = false;

			// Frame animation
			if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
				lastFrameTime = timestamp;
				frameRef.current = (frameRef.current + 1) % SPRITE_CONFIG[stateRef.current].frames;
				needsRender = true;
			}

			// Movement (only when walking)
			if (stateRef.current === 'walk') {
				const deltaTime = timestamp - lastMoveTime;
				if (deltaTime > 0) {
					const movement = (directionRef.current === 'right' ? WALK_SPEED : -WALK_SPEED) * deltaTime;
					let newPos = positionRef.current + movement;

					// Bounce off edges (account for 3x scale, cow expands from bottom-left)
					const minX = COW_SIZE;
					const maxX = trackWidth - COW_SIZE * 3; // 3x scale means 96px visual width

					if (newPos <= minX) {
						newPos = minX;
						directionRef.current = 'right';
					} else if (newPos >= maxX) {
						newPos = maxX;
						directionRef.current = 'left';
					}

					positionRef.current = newPos;

					// Accumulate MooCoins while walking
					microCoinsRef.current += deltaTime;
					if (microCoinsRef.current >= MICROCOIN_PER_COIN) {
						microCoinsRef.current -= MICROCOIN_PER_COIN;
						awardCoin(newPos);
					}

					// Save periodically (every 10 seconds)
					const now = Date.now();
					if (now - lastSaveRef.current > 10000) {
						lastSaveRef.current = now;
						saveMooCoins(mooCoins, microCoinsRef.current);
					}

					needsRender = true;
				}
			}
			lastMoveTime = timestamp;

			// Trigger render if needed
			if (needsRender) {
				setRenderTick(t => t + 1);
			}

			animationRef.current = requestAnimationFrame(animate);
		};

		animationRef.current = requestAnimationFrame(animate);
		scheduleStateChange();

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
			if (stateTimerRef.current) {
				clearTimeout(stateTimerRef.current);
			}
			// Save on unmount
			saveMooCoins(mooCoins, microCoinsRef.current);
		};
	}, [trackWidth, scheduleStateChange, awardCoin, mooCoins]);

	// Click handler - make cow do something
	const handleClick = useCallback(() => {
		// Wake up if sleeping, otherwise change direction
		if (stateRef.current === 'sleep') {
			stateRef.current = 'idle';
		} else {
			stateRef.current = 'walk';
			directionRef.current = directionRef.current === 'left' ? 'right' : 'left';
		}
		frameRef.current = 0;

		// Reschedule state change
		if (stateTimerRef.current) {
			clearTimeout(stateTimerRef.current);
		}
		scheduleStateChange();

		setRenderTick(t => t + 1);
	}, [scheduleStateChange]);

	// Double-click to hide/show
	const handleDoubleClick = useCallback(() => {
		setVisible(v => !v);
	}, []);

	// Calculate progress to next coin (0-100%)
	const progressPercent = (microCoinsRef.current / MICROCOIN_PER_COIN) * 100;

	if (!visible) {
		return (
			<div className="racetrackCowContainer">
				<div
					className="racetrackCowHidden"
					onClick={handleDoubleClick}
					title="Click to bring back the cow"
				/>
				{/* Always show coin counter */}
				<div className="mooCoinCounterWrapper">
					<div className="mooCoinCounter" title={`Progress: ${progressPercent.toFixed(1)}%`}>
						<span className="mooCoinIcon">🪙</span>
						<span className="mooCoinCount">{mooCoins}</span>
						<span className="mooCoinLabel">MooCoins</span>
					</div>
					<button
						className={`mooSoundToggle ${mooSoundOn ? 'on' : 'off'}`}
						onClick={(e) => { e.stopPropagation(); toggleMooSound(); }}
						title={mooSoundOn ? 'Moo sound: ON' : 'Moo sound: OFF'}
					>
						{mooSoundOn ? '🔊' : '🔇'}
					</button>
				</div>
			</div>
		);
	}

	const config = SPRITE_CONFIG[stateRef.current];
	const dirRow = directionRef.current === 'left' ? DIRECTION_ROW.left : DIRECTION_ROW.right;
	const frameX = frameRef.current * 64;
	const frameY = dirRow * 64;

	// Convert pixel position to percentage for responsive scaling
	const leftPercent = (positionRef.current / trackWidth) * 100;

	return (
		<div className="racetrackCowContainer">
			{/* The cow */}
			<div
				className={`racetrackCow ${stateRef.current}`}
				style={{
					left: `${leftPercent}%`,
					width: `${COW_SIZE}px`,
					height: `${COW_SIZE}px`,
					backgroundImage: `url('${config.src}')`,
					backgroundPosition: `-${frameX * (COW_SIZE / 64)}px -${frameY * (COW_SIZE / 64)}px`,
					backgroundSize: `${config.width * (COW_SIZE / 64)}px ${config.height * (COW_SIZE / 64)}px`,
				}}
				onClick={handleClick}
				onDblClick={handleDoubleClick}
				title="Click me!"
			/>

			{/* MooCoin counter */}
			<div className="mooCoinCounterWrapper">
				<div className="mooCoinCounter" title={`Progress: ${progressPercent.toFixed(1)}%`}>
					<div className="mooCoinProgress" style={{ width: `${progressPercent}%` }} />
					<span className="mooCoinIcon">🪙</span>
					<span className="mooCoinCount">{mooCoins}</span>
					<span className="mooCoinLabel">MooCoins</span>
				</div>
				<button
					className={`mooSoundToggle ${mooSoundOn ? 'on' : 'off'}`}
					onClick={(e) => { e.stopPropagation(); toggleMooSound(); }}
					title={mooSoundOn ? 'Moo sound: ON' : 'Moo sound: OFF'}
				>
					{mooSoundOn ? '🔊' : '🔇'}
				</button>
			</div>

			{/* Floating +1 coins */}
			{floatingCoins.map(coin => (
				<div
					key={coin.id}
					className="floatingCoin"
					style={{ left: `${(coin.x / trackWidth) * 100}%` }}
				>
					+1 🪙
				</div>
			))}

			{/* Confetti */}
			{confetti.map(p => (
				<div
					key={p.id}
					className="mooCoinConfetti"
					style={{
						left: `${(p.x / trackWidth) * 100}%`,
						top: `${p.y}px`,
						backgroundColor: p.color,
						transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
					}}
				/>
			))}
		</div>
	);
}
