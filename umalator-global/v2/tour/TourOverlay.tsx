/**
 * Tour Overlay
 * Full-screen backdrop with SVG spotlight cutout
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useTour } from './TourContext';
import { TourTooltip } from './TourTooltip';

interface TargetRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function TourOverlay() {
	const { state } = useTour();
	const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
	const [isTransitioning, setIsTransitioning] = useState(false);

	const currentStep = state.isActive ? state.steps[state.currentStepIndex] : null;

	// Execute beforeShow callback and calculate target position
	useEffect(() => {
		if (!currentStep) {
			setTargetRect(null);
			return;
		}

		let cancelled = false;

		async function setup() {
			setIsTransitioning(true);

			// Run beforeShow if defined
			if (currentStep.beforeShow) {
				await currentStep.beforeShow();
			}

			if (cancelled) return;

			// Find and measure target element
			const target = document.querySelector(currentStep.targetSelector);
			if (target) {
				const rect = target.getBoundingClientRect();
				const padding = currentStep.spotlightPadding ?? 8;
				setTargetRect({
					x: rect.left - padding,
					y: rect.top - padding,
					width: rect.width + padding * 2,
					height: rect.height + padding * 2,
				});
			} else {
				console.warn(`Tour target not found: ${currentStep.targetSelector}`);
				setTargetRect(null);
			}

			setIsTransitioning(false);
		}

		setup();

		// Recalculate on resize/scroll
		const handleResize = () => {
			if (cancelled) return;
			const target = document.querySelector(currentStep.targetSelector);
			if (target) {
				const rect = target.getBoundingClientRect();
				const padding = currentStep.spotlightPadding ?? 8;
				setTargetRect({
					x: rect.left - padding,
					y: rect.top - padding,
					width: rect.width + padding * 2,
					height: rect.height + padding * 2,
				});
			}
		};

		window.addEventListener('resize', handleResize);
		window.addEventListener('scroll', handleResize, true);

		// For moving elements, use animation frame to continuously track
		let trackingFrameId: number | null = null;
		if (currentStep.trackMovement) {
			const trackTarget = () => {
				if (cancelled) return;
				const target = document.querySelector(currentStep.targetSelector);
				if (target) {
					const rect = target.getBoundingClientRect();
					const padding = currentStep.spotlightPadding ?? 8;
					setTargetRect({
						x: rect.left - padding,
						y: rect.top - padding,
						width: rect.width + padding * 2,
						height: rect.height + padding * 2,
					});
				}
				trackingFrameId = requestAnimationFrame(trackTarget);
			};
			trackingFrameId = requestAnimationFrame(trackTarget);
		}

		return () => {
			cancelled = true;
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('scroll', handleResize, true);
			if (trackingFrameId !== null) {
				cancelAnimationFrame(trackingFrameId);
			}
		};
	}, [currentStep]);

	if (!state.isActive || !currentStep) {
		return null;
	}

	const overlayContent = (
		<div class="v2-tour-overlay">
			{/* SVG overlay with spotlight cutout */}
			<svg class="v2-tour-overlay-svg" preserveAspectRatio="none">
				<defs>
					<mask id="tour-spotlight-mask">
						{/* White = visible (backdrop), Black = transparent (spotlight) */}
						<rect x="0" y="0" width="100%" height="100%" fill="white" />
						{targetRect && (
							currentStep.highlightType === 'circle' ? (
								<ellipse
									cx={targetRect.x + targetRect.width / 2}
									cy={targetRect.y + targetRect.height / 2}
									rx={targetRect.width / 2 + 4}
									ry={targetRect.height / 2 + 4}
									fill="black"
								/>
							) : (
								<rect
									x={targetRect.x}
									y={targetRect.y}
									width={targetRect.width}
									height={targetRect.height}
									rx="8"
									fill="black"
								/>
							)
						)}
					</mask>
				</defs>
				<rect
					class="v2-tour-overlay-backdrop"
					x="0"
					y="0"
					width="100%"
					height="100%"
					mask="url(#tour-spotlight-mask)"
				/>
			</svg>

			{/* Highlight border around target */}
			{targetRect && (
				<div
					class={`v2-tour-spotlight ${currentStep.highlightType === 'circle' ? 'circle' : 'rect'}`}
					style={{
						left: `${targetRect.x}px`,
						top: `${targetRect.y}px`,
						width: `${targetRect.width}px`,
						height: `${targetRect.height}px`,
					}}
				/>
			)}

			{/* Tooltip with step content */}
			{targetRect && !isTransitioning && (
				<TourTooltip
					step={currentStep}
					targetRect={targetRect}
					stepIndex={state.currentStepIndex}
					totalSteps={state.steps.length}
				/>
			)}
		</div>
	);

	return createPortal(overlayContent, document.body);
}
