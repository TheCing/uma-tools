/**
 * Textarea Component
 * Multi-line text input with optional label, helper text, error state, auto-resize.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { JSX } from 'preact';
import { forwardRef } from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';

interface TextareaProps {
	value?: string;
	onInput?: (value: string) => void;
	onChange?: (value: string) => void;
	placeholder?: string;
	label?: string;
	helperText?: string;
	error?: string;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	maxLength?: number;
	rows?: number;
	autoResize?: boolean;
	showCount?: boolean;
	name?: string;
	id?: string;
	className?: string;
	onFocus?: () => void;
	onBlur?: () => void;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({
	value = '',
	onInput,
	onChange,
	placeholder,
	label,
	helperText,
	error,
	disabled = false,
	readOnly = false,
	required = false,
	maxLength,
	rows = 4,
	autoResize = false,
	showCount = false,
	name,
	id,
	className = '',
	onFocus,
	onBlur,
}, ref) {
	const internalRef = useRef<HTMLTextAreaElement>(null);
	const describedById = id ? `${id}-desc` : undefined;
	const hasError = Boolean(error);
	const stringValue = String(value ?? '');

	// Forward the ref
	useEffect(() => {
		if (!ref) return;
		if (typeof ref === 'function') ref(internalRef.current);
		else (ref as any).current = internalRef.current;
	}, [ref]);

	// Auto-resize: adjust height to content
	useEffect(() => {
		if (!autoResize || !internalRef.current) return;
		const el = internalRef.current;
		el.style.height = 'auto';
		el.style.height = `${el.scrollHeight}px`;
	}, [stringValue, autoResize]);

	const handleInput: JSX.GenericEventHandler<HTMLTextAreaElement> = (e) => {
		onInput?.((e.currentTarget as HTMLTextAreaElement).value);
	};
	const handleChange: JSX.GenericEventHandler<HTMLTextAreaElement> = (e) => {
		onChange?.((e.currentTarget as HTMLTextAreaElement).value);
	};

	return (
		<div class={`v2-input-field ${className}`}>
			{label && (
				<label class="v2-input-label" for={id}>
					{label}
					{required && <span class="v2-input-required" aria-hidden="true"> *</span>}
				</label>
			)}
			<textarea
				ref={internalRef}
				id={id}
				name={name}
				value={stringValue}
				placeholder={placeholder}
				disabled={disabled}
				readOnly={readOnly}
				required={required}
				maxLength={maxLength}
				rows={rows}
				aria-invalid={hasError || undefined}
				aria-describedby={describedById}
				class={`v2-input v2-textarea ${autoResize ? 'auto-resize' : ''} ${hasError ? 'v2-input-error' : ''}`}
				onInput={handleInput}
				onChange={handleChange}
				onFocus={onFocus}
				onBlur={onBlur}
			/>
			{(helperText || error || (showCount && maxLength)) && (
				<div id={describedById} class={`v2-input-helper-row ${hasError ? 'v2-input-helper-error' : ''}`}>
					<span class="v2-input-helper">{error || helperText}</span>
					{showCount && maxLength && (
						<span class="v2-input-count">{stringValue.length}/{maxLength}</span>
					)}
				</div>
			)}
		</div>
	);
});
