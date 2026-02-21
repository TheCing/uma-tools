/**
 * Button Component
 * Styled button with variants
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';

interface ButtonProps {
	children: ComponentChildren;
	onClick?: () => void;
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;
	type?: 'button' | 'submit' | 'reset';
	className?: string;
	icon?: ComponentChildren;  // Lucide icon or other component
	iconPosition?: 'left' | 'right';
}

export function Button({
	children,
	onClick,
	variant = 'secondary',
	size = 'md',
	disabled = false,
	type = 'button',
	className = '',
	icon,
	iconPosition = 'left'
}: ButtonProps) {
	return (
		<button
			type={type}
			class={`v2-button v2-button-${variant} v2-button-${size} ${className}`}
			onClick={onClick}
			disabled={disabled}
		>
			{icon && iconPosition === 'left' && icon}
			{children}
			{icon && iconPosition === 'right' && icon}
		</button>
	);
}
