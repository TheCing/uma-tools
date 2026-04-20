/**
 * Input Component
 * Text/number/search input with optional label, helper text, error state, icon slots.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { forwardRef } from 'preact/compat';

type InputType = 'text' | 'number' | 'search' | 'email' | 'password' | 'tel' | 'url';

interface InputProps {
	value?: string | number;
	onInput?: (value: string) => void;
	onChange?: (value: string) => void;
	type?: InputType;
	placeholder?: string;
	label?: string;
	helperText?: string;
	error?: string;
	iconLeft?: ComponentChildren;
	iconRight?: ComponentChildren;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	min?: number;
	max?: number;
	step?: number;
	maxLength?: number;
	name?: string;
	id?: string;
	autoComplete?: string;
	className?: string;
	onFocus?: () => void;
	onBlur?: () => void;
	onKeyDown?: (e: KeyboardEvent) => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
	value,
	onInput,
	onChange,
	type = 'text',
	placeholder,
	label,
	helperText,
	error,
	iconLeft,
	iconRight,
	disabled = false,
	readOnly = false,
	required = false,
	min,
	max,
	step,
	maxLength,
	name,
	id,
	autoComplete,
	className = '',
	onFocus,
	onBlur,
	onKeyDown,
}, ref) {
	const describedById = id ? `${id}-desc` : undefined;
	const hasError = Boolean(error);

	const handleInput: JSX.GenericEventHandler<HTMLInputElement> = (e) => {
		onInput?.((e.currentTarget as HTMLInputElement).value);
	};
	const handleChange: JSX.GenericEventHandler<HTMLInputElement> = (e) => {
		onChange?.((e.currentTarget as HTMLInputElement).value);
	};

	const inputEl = (
		<input
			ref={ref as any}
			id={id}
			name={name}
			type={type}
			value={value as any}
			placeholder={placeholder}
			disabled={disabled}
			readOnly={readOnly}
			required={required}
			min={min}
			max={max}
			step={step}
			maxLength={maxLength}
			autoComplete={autoComplete}
			aria-invalid={hasError || undefined}
			aria-describedby={describedById}
			class={`v2-input ${hasError ? 'v2-input-error' : ''}`}
			onInput={handleInput}
			onChange={handleChange}
			onFocus={onFocus}
			onBlur={onBlur}
			onKeyDown={onKeyDown}
		/>
	);

	const field = (iconLeft || iconRight) ? (
		<div class={`v2-input-wrap ${iconLeft ? 'has-icon-left' : ''} ${iconRight ? 'has-icon-right' : ''}`}>
			{iconLeft && <span class="v2-input-icon v2-input-icon-left">{iconLeft}</span>}
			{inputEl}
			{iconRight && <span class="v2-input-icon v2-input-icon-right">{iconRight}</span>}
		</div>
	) : inputEl;

	return (
		<div class={`v2-input-field ${className}`}>
			{label && (
				<label class="v2-input-label" for={id}>
					{label}
					{required && <span class="v2-input-required" aria-hidden="true"> *</span>}
				</label>
			)}
			{field}
			{(helperText || error) && (
				<div id={describedById} class={`v2-input-helper ${hasError ? 'v2-input-helper-error' : ''}`}>
					{error || helperText}
				</div>
			)}
		</div>
	);
});
