/**
 * Checkbox Component
 * Styled checkbox with optional label and indeterminate state.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Check, Minus } from 'lucide-react';

interface CheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label?: ComponentChildren;
	indeterminate?: boolean;
	disabled?: boolean;
	name?: string;
	id?: string;
	className?: string;
}

export function Checkbox({
	checked,
	onChange,
	label,
	indeterminate = false,
	disabled = false,
	name,
	id,
	className = '',
}: CheckboxProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (inputRef.current) {
			inputRef.current.indeterminate = indeterminate && !checked;
		}
	}, [indeterminate, checked]);

	return (
		<label class={`v2-checkbox ${disabled ? 'disabled' : ''} ${className}`}>
			<input
				ref={inputRef}
				id={id}
				name={name}
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
			/>
			<span class="v2-checkbox-box" aria-hidden="true">
				{indeterminate && !checked
					? <Minus size={12} strokeWidth={3} />
					: checked && <Check size={12} strokeWidth={3} />}
			</span>
			{label && <span class="v2-checkbox-label">{label}</span>}
		</label>
	);
}
