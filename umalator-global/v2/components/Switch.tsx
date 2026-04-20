/**
 * Switch Component
 * Toggle switch wrapping the existing .v2-switch CSS for binary on/off settings.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';

interface SwitchProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label?: ComponentChildren;
	labelPosition?: 'left' | 'right';
	disabled?: boolean;
	name?: string;
	id?: string;
	className?: string;
	'aria-label'?: string;
}

export function Switch({
	checked,
	onChange,
	label,
	labelPosition = 'right',
	disabled = false,
	name,
	id,
	className = '',
	'aria-label': ariaLabel,
}: SwitchProps) {
	const labelNode = label && <span class="v2-switch-label">{label}</span>;

	return (
		<label class={`v2-switch ${disabled ? 'disabled' : ''} ${className}`}>
			{labelPosition === 'left' && labelNode}
			<input
				id={id}
				name={name}
				type="checkbox"
				role="switch"
				checked={checked}
				disabled={disabled}
				aria-label={ariaLabel}
				onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
			/>
			<span class="v2-switch-slider" aria-hidden="true" />
			{labelPosition === 'right' && labelNode}
		</label>
	);
}
