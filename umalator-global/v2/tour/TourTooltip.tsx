/**
 * Tour Tooltip
 * Positioned tooltip with step content and navigation controls
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { useLayoutEffect, useRef, useState, useEffect } from 'preact/hooks';
import { useTour } from './TourContext';
import type { TourStep } from './types';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components';

interface TourTooltipProps {
	step: TourStep;
	targetRect: { x: number; y: number; width: number; height: number };
	stepIndex: number;
	totalSteps: number;
}

interface Position {
	x: number;
	y: number;
	actualPosition: 'top' | 'bottom' | 'left' | 'right';
}

export function TourTooltip({ step, targetRect, stepIndex, totalSteps }: TourTooltipProps) {
	const { nextStep, prevStep, skipTour, endTour } = useTour();
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<Position | null>(null);

	const isFirstStep = stepIndex === 0;
	const isLastStep = stepIndex === totalSteps - 1;

	// Calculate position after render
	useLayoutEffect(() => {
		if (!tooltipRef.current) return;

		const tooltip = tooltipRef.current;
		const tooltipRect = tooltip.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const spacing = 16;

		let x = 0;
		let y = 0;
		let actualPosition: 'top' | 'bottom' | 'left' | 'right' = step.position === 'auto' ? 'bottom' : step.position;

		// Auto-position: prefer bottom, fallback as needed
		if (step.position === 'auto') {
			const spaceBelow = viewportHeight - (targetRect.y + targetRect.height);
			const spaceAbove = targetRect.y;
			const spaceRight = viewportWidth - (targetRect.x + targetRect.width);
			const spaceLeft = targetRect.x;

			if (spaceBelow >= tooltipRect.height + spacing) {
				actualPosition = 'bottom';
			} else if (spaceAbove >= tooltipRect.height + spacing) {
				actualPosition = 'top';
			} else if (spaceRight >= tooltipRect.width + spacing) {
				actualPosition = 'right';
			} else {
				actualPosition = 'left';
			}
		}

		// Calculate coordinates based on position
		switch (actualPosition) {
			case 'bottom':
				x = targetRect.x + targetRect.width / 2 - tooltipRect.width / 2;
				y = targetRect.y + targetRect.height + spacing;
				break;
			case 'top':
				x = targetRect.x + targetRect.width / 2 - tooltipRect.width / 2;
				y = targetRect.y - tooltipRect.height - spacing;
				break;
			case 'right':
				x = targetRect.x + targetRect.width + spacing;
				y = targetRect.y + targetRect.height / 2 - tooltipRect.height / 2;
				break;
			case 'left':
				x = targetRect.x - tooltipRect.width - spacing;
				y = targetRect.y + targetRect.height / 2 - tooltipRect.height / 2;
				break;
		}

		// Clamp to viewport
		x = Math.max(spacing, Math.min(x, viewportWidth - tooltipRect.width - spacing));
		y = Math.max(spacing, Math.min(y, viewportHeight - tooltipRect.height - spacing));

		setPosition({ x, y, actualPosition });
	}, [step.position, targetRect]);

	// Handle keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case 'Escape':
					skipTour();
					break;
				case 'ArrowRight':
				case 'Enter':
					if (!isLastStep) nextStep();
					else endTour();
					break;
				case 'ArrowLeft':
					if (!isFirstStep) prevStep();
					break;
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isFirstStep, isLastStep, nextStep, prevStep, skipTour, endTour]);

	return (
		<div
			ref={tooltipRef}
			class={`v2-tour-tooltip v2-tour-tooltip-${position?.actualPosition ?? step.position}`}
			style={position ? {
				left: `${position.x}px`,
				top: `${position.y}px`,
				opacity: 1,
			} : {
				opacity: 0,
				pointerEvents: 'none',
			}}
		>
			{/* Close button */}
			<button
				type="button"
				class="v2-tour-tooltip-close"
				onClick={skipTour}
				aria-label="Skip tour"
			>
				<X size={14} />
			</button>

			{/* Content */}
			<div class="v2-tour-tooltip-content">
				<h3 class="v2-tour-tooltip-title">{step.title}</h3>
				<p class="v2-tour-tooltip-text">{step.content}</p>
			</div>

			{/* Footer with navigation */}
			<div class="v2-tour-tooltip-footer">
				<span class="v2-tour-tooltip-progress">
					{stepIndex + 1} / {totalSteps}
				</span>
				<div class="v2-tour-tooltip-actions">
					{!isFirstStep && (
						<Button variant="ghost" size="sm" onClick={prevStep}>
							<ChevronLeft size={14} />
							Back
						</Button>
					)}
					{isLastStep ? (
						<Button variant="primary" size="sm" onClick={endTour}>
							Done
						</Button>
					) : (
						<Button variant="primary" size="sm" onClick={nextStep}>
							Next
							<ChevronRight size={14} />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
