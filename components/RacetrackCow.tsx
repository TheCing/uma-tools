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

// Sprite sheet config (same as demo)
const SPRITE_CONFIG = {
	idle: { src: '/uma-tools/icons/cow/White_Cow_Idle.png', frames: 6, width: 384, height: 256 },
	walk: { src: '/uma-tools/icons/cow/White_Cow_Walk.png', frames: 4, width: 256, height: 256 },
	sleep: { src: '/uma-tools/icons/cow/White_Cow_Sleeping.png', frames: 4, width: 256, height: 256 },
};

// Direction to sprite row mapping
const DIRECTION_ROW = { back: 0, front: 1, left: 2, right: 3 };

export function RacetrackCow({ trackWidth }: RacetrackCowProps) {
	// Use refs for animation state to avoid re-creating animation loop
	const positionRef = useRef(Math.random() * (trackWidth - COW_SIZE * 2) + COW_SIZE);
	const directionRef = useRef<CowDirection>(Math.random() > 0.5 ? 'right' : 'left');
	const stateRef = useRef<CowState>('walk');
	const frameRef = useRef(0);

	// React state for rendering
	const [renderTick, setRenderTick] = useState(0);
	const [visible, setVisible] = useState(true);

	const stateTimerRef = useRef<number | null>(null);
	const animationRef = useRef<number | null>(null);

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

					// Bounce off edges
					const minX = COW_SIZE;
					const maxX = trackWidth - COW_SIZE * 2;

					if (newPos <= minX) {
						newPos = minX;
						directionRef.current = 'right';
					} else if (newPos >= maxX) {
						newPos = maxX;
						directionRef.current = 'left';
					}

					positionRef.current = newPos;
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
		};
	}, [trackWidth, scheduleStateChange]);

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

	if (!visible) {
		return (
			<div
				className="racetrackCowHidden"
				onDblClick={handleDoubleClick}
				title="Double-click to bring back the cow"
			/>
		);
	}

	const config = SPRITE_CONFIG[stateRef.current];
	const dirRow = directionRef.current === 'left' ? DIRECTION_ROW.left : DIRECTION_ROW.right;
	const frameX = frameRef.current * 64;
	const frameY = dirRow * 64;

	// Convert pixel position to percentage for responsive scaling
	const leftPercent = (positionRef.current / trackWidth) * 100;

	return (
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
	);
}
