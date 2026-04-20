/**
 * SegmentedControl Component
 * Single-choice form control for small enum sets (3-6 options).
 * Uses radiogroup semantics (not tablist) — it's a form input, not navigation.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

export interface SegmentOption<T extends string | number = string | number> {
	value: T;
	label?: ComponentChildren;
	icon?: ComponentChildren;
	disabled?: boolean;
	title?: string;
}

interface SegmentedControlProps<T extends string | number = string | number> {
	value: T;
	onChange: (value: T) => void;
	options: SegmentOption<T>[];
	size?: 'sm' | 'md';
	fullWidth?: boolean;
	iconOnly?: boolean;  // Hide labels, show only icons (with title/aria-label fallback)
	className?: string;
	ariaLabel?: string;
	name?: string;
}

export function SegmentedControl<T extends string | number = string | number>({
	value,
	onChange,
	options,
	size = 'md',
	fullWidth = false,
	iconOnly = false,
	className = '',
	ariaLabel,
	name,
}: SegmentedControlProps<T>) {
	const groupRef = useRef<HTMLDivElement>(null);

	function focusByIndex(index: number) {
		const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])');
		if (!buttons) return;
		const clamped = (index + buttons.length) % buttons.length;
		buttons[clamped]?.focus();
	}

	function handleKeyDown(e: KeyboardEvent) {
		const enabled = options.filter(o => !o.disabled);
		const currentPos = enabled.findIndex(o => o.value === value);
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			const next = enabled[(currentPos + 1) % enabled.length];
			onChange(next.value);
			focusByIndex((currentPos + 1) % enabled.length);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			const prev = enabled[(currentPos - 1 + enabled.length) % enabled.length];
			onChange(prev.value);
			focusByIndex((currentPos - 1 + enabled.length) % enabled.length);
		} else if (e.key === 'Home') {
			e.preventDefault();
			onChange(enabled[0].value);
			focusByIndex(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			onChange(enabled[enabled.length - 1].value);
			focusByIndex(enabled.length - 1);
		}
	}

	return (
		<div
			ref={groupRef}
			role="radiogroup"
			aria-label={ariaLabel}
			data-name={name}
			class={`v2-segmented v2-segmented-${size} ${fullWidth ? 'full-width' : ''} ${iconOnly ? 'icon-only' : ''} ${className}`}
			onKeyDown={handleKeyDown}
		>
			{options.map(opt => {
				const selected = opt.value === value;
				return (
					<button
						key={String(opt.value)}
						type="button"
						role="radio"
						aria-checked={selected}
						aria-label={iconOnly && typeof opt.label === 'string' ? opt.label : undefined}
						tabIndex={selected ? 0 : -1}
						disabled={opt.disabled}
						title={opt.title}
						class={`v2-segment ${selected ? 'active' : ''}`}
						onClick={() => !opt.disabled && onChange(opt.value)}
					>
						{opt.icon && <span class="v2-segment-icon">{opt.icon}</span>}
						{!iconOnly && opt.label !== undefined && (
							<span class="v2-segment-label">{opt.label}</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
