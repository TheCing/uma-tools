/**
 * Tooltip Component
 * Custom themed tooltip that replaces native browser tooltips
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'preact/hooks';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
	content: string;
	children: ComponentChildren;
	position?: TooltipPosition;
	delay?: number;
	className?: string;
}

interface Coords {
	x: number;
	y: number;
	ready: boolean;
}

export function Tooltip({
	content,
	children,
	position = 'top',
	delay = 400,
	className = '',
}: TooltipProps) {
	const [isVisible, setIsVisible] = useState(false);
	const [coords, setCoords] = useState<Coords>({ x: 0, y: 0, ready: false });
	const triggerRef = useRef<HTMLDivElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const timeoutRef = useRef<number | null>(null);

	const calculatePosition = useCallback(() => {
		if (!triggerRef.current) return;

		const rect = triggerRef.current.getBoundingClientRect();
		let x = rect.left + rect.width / 2;
		let y = rect.top;

		switch (position) {
			case 'bottom':
				y = rect.bottom;
				break;
			case 'left':
				x = rect.left;
				y = rect.top + rect.height / 2;
				break;
			case 'right':
				x = rect.right;
				y = rect.top + rect.height / 2;
				break;
			default: // top
				break;
		}

		setCoords({ x, y, ready: true });
	}, [position]);

	const showTooltip = useCallback(() => {
		timeoutRef.current = window.setTimeout(() => {
			calculatePosition();
			setIsVisible(true);
		}, delay);
	}, [delay, calculatePosition]);

	const hideTooltip = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		setIsVisible(false);
		setCoords({ x: 0, y: 0, ready: false });
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);

	// Adjust position after render if tooltip overflows viewport
	useLayoutEffect(() => {
		if (isVisible && coords.ready && tooltipRef.current) {
			const tooltip = tooltipRef.current;
			const rect = tooltip.getBoundingClientRect();
			const viewportWidth = window.innerWidth;

			// Horizontal overflow adjustments
			if (rect.right > viewportWidth - 8) {
				const overflow = rect.right - (viewportWidth - 8);
				tooltip.style.left = `${coords.x - overflow}px`;
			}
			if (rect.left < 8) {
				tooltip.style.left = `${8 + rect.width / 2}px`;
			}

			// Vertical overflow - flip position if needed
			if (position === 'top' && rect.top < 8) {
				tooltip.classList.add('flipped');
			}
			if (position === 'bottom' && rect.bottom > window.innerHeight - 8) {
				tooltip.classList.add('flipped');
			}
		}
	}, [isVisible, coords, position]);

	if (!content) {
		return <>{children}</>;
	}

	const tooltipElement = isVisible && coords.ready && createPortal(
		<div
			ref={tooltipRef}
			class={`v2-tooltip v2-tooltip-${position}`}
			style={{
				left: `${coords.x}px`,
				top: `${coords.y}px`,
			}}
			role="tooltip"
		>
			{content}
			<div class="v2-tooltip-arrow" />
		</div>,
		document.body
	);

	return (
		<div
			ref={triggerRef}
			class={`v2-tooltip-trigger ${className}`}
			onMouseEnter={showTooltip}
			onMouseLeave={hideTooltip}
			onFocus={showTooltip}
			onBlur={hideTooltip}
		>
			{children}
			{tooltipElement}
		</div>
	);
}
