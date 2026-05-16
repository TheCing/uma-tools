/**
 * Badge Component
 * Small status indicator / tag with semantic variants.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { X } from 'lucide-react';

type BadgeVariant = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
	children: ComponentChildren;
	variant?: BadgeVariant;
	size?: BadgeSize;
	outline?: boolean;
	dot?: boolean;
	icon?: ComponentChildren;
	onRemove?: () => void;
	className?: string;
	title?: string;
}

export function Badge({
	children,
	variant = 'neutral',
	size = 'md',
	outline = false,
	dot = false,
	icon,
	onRemove,
	className = '',
	title,
}: BadgeProps) {
	return (
		<span
			class={`v2-badge v2-badge-${variant} v2-badge-${size} ${outline ? 'outline' : ''} ${className}`}
			title={title}
		>
			{dot && <span class="v2-badge-dot" aria-hidden="true" />}
			{icon && <span class="v2-badge-icon">{icon}</span>}
			<span class="v2-badge-content">{children}</span>
			{onRemove && (
				<button
					type="button"
					class="v2-badge-remove"
					onClick={(e) => { e.stopPropagation(); onRemove(); }}
					aria-label="Remove"
				>
					<X size={10} strokeWidth={3} />
				</button>
			)}
		</span>
	);
}
