/**
 * NumberInput Component
 * Numeric input with clamp/step, optional +/- stepper buttons, and unit suffix.
 * Controlled. Emits number | null (null when empty and allowEmpty=true).
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useState, useEffect, useRef } from 'preact/hooks';
import { Plus, Minus } from 'lucide-react';

interface NumberInputProps {
	value: number | null;
	onChange: (value: number | null) => void;
	min?: number;
	max?: number;
	step?: number;
	precision?: number;  // Decimal places to round to on commit
	placeholder?: string;
	label?: string;
	helperText?: string;
	error?: string;
	suffix?: ComponentChildren;  // e.g. "m/s", "%", or an icon
	prefix?: ComponentChildren;
	stepper?: boolean;  // Show +/- buttons
	allowEmpty?: boolean;  // Emit null instead of clamping when blank
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	name?: string;
	id?: string;
	className?: string;
	onFocus?: () => void;
	onBlur?: () => void;
}

function clamp(v: number, min?: number, max?: number) {
	if (min !== undefined && v < min) v = min;
	if (max !== undefined && v > max) v = max;
	return v;
}

function round(v: number, precision?: number) {
	if (precision === undefined) return v;
	const factor = Math.pow(10, precision);
	return Math.round(v * factor) / factor;
}

export function NumberInput({
	value,
	onChange,
	min,
	max,
	step = 1,
	precision,
	placeholder,
	label,
	helperText,
	error,
	suffix,
	prefix,
	stepper = false,
	allowEmpty = false,
	disabled = false,
	readOnly = false,
	required = false,
	name,
	id,
	className = '',
	onFocus,
	onBlur,
}: NumberInputProps) {
	const [text, setText] = useState<string>(value === null || value === undefined ? '' : String(value));
	const lastCommitted = useRef<number | null>(value);

	// Sync external value changes into the local text buffer (but don't clobber while user is typing mid-edit)
	useEffect(() => {
		if (value !== lastCommitted.current) {
			setText(value === null || value === undefined ? '' : String(value));
			lastCommitted.current = value;
		}
	}, [value]);

	const commit = useCallback((raw: string) => {
		if (raw.trim() === '') {
			if (allowEmpty) {
				lastCommitted.current = null;
				onChange(null);
				setText('');
				return;
			}
			// Fall back to min, or 0
			const fallback = min ?? 0;
			lastCommitted.current = fallback;
			onChange(fallback);
			setText(String(fallback));
			return;
		}
		const parsed = parseFloat(raw);
		if (Number.isNaN(parsed)) {
			setText(value === null || value === undefined ? '' : String(value));
			return;
		}
		const final = round(clamp(parsed, min, max), precision);
		lastCommitted.current = final;
		onChange(final);
		setText(String(final));
	}, [allowEmpty, min, max, precision, onChange, value]);

	const handleInput: JSX.GenericEventHandler<HTMLInputElement> = (e) => {
		setText((e.currentTarget as HTMLInputElement).value);
	};

	const handleBlur = () => {
		commit(text);
		onBlur?.();
	};

	const handleKeyDown: JSX.KeyboardEventHandler<HTMLInputElement> = (e) => {
		if (e.key === 'Enter') {
			commit(text);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			bump(+1);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			bump(-1);
		}
	};

	const bump = (dir: 1 | -1) => {
		const base = value ?? min ?? 0;
		const next = round(clamp(base + dir * step, min, max), precision);
		lastCommitted.current = next;
		onChange(next);
		setText(String(next));
	};

	const describedById = id ? `${id}-desc` : undefined;
	const hasError = Boolean(error);

	return (
		<div class={`v2-input-field ${className}`}>
			{label && (
				<label class="v2-input-label" for={id}>
					{label}
					{required && <span class="v2-input-required" aria-hidden="true"> *</span>}
				</label>
			)}
			<div class={`v2-number-wrap ${prefix ? 'has-prefix' : ''} ${suffix ? 'has-suffix' : ''} ${stepper ? 'has-stepper' : ''}`}>
				{prefix && <span class="v2-number-prefix">{prefix}</span>}
				<input
					id={id}
					name={name}
					type="text"
					inputMode="decimal"
					value={text}
					placeholder={placeholder}
					disabled={disabled}
					readOnly={readOnly}
					required={required}
					aria-invalid={hasError || undefined}
					aria-describedby={describedById}
					class={`v2-input v2-number-input ${hasError ? 'v2-input-error' : ''}`}
					onInput={handleInput}
					onBlur={handleBlur}
					onFocus={onFocus}
					onKeyDown={handleKeyDown}
				/>
				{suffix && <span class="v2-number-suffix">{suffix}</span>}
				{stepper && (
					<div class="v2-number-stepper">
						<button
							type="button"
							class="v2-number-step-btn"
							onClick={() => bump(+1)}
							disabled={disabled || readOnly || (max !== undefined && (value ?? 0) >= max)}
							aria-label="Increment"
							tabIndex={-1}
						>
							<Plus size={10} strokeWidth={3} />
						</button>
						<button
							type="button"
							class="v2-number-step-btn"
							onClick={() => bump(-1)}
							disabled={disabled || readOnly || (min !== undefined && (value ?? 0) <= min)}
							aria-label="Decrement"
							tabIndex={-1}
						>
							<Minus size={10} strokeWidth={3} />
						</button>
					</div>
				)}
			</div>
			{(helperText || error) && (
				<div id={describedById} class={`v2-input-helper ${hasError ? 'v2-input-helper-error' : ''}`}>
					{error || helperText}
				</div>
			)}
		</div>
	);
}
