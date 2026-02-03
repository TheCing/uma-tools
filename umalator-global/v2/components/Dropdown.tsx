/**
 * Dropdown Menu Component
 * For action menus and settings
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

export interface DropdownItem {
	id: string;
	label: string;
	icon?: ComponentChildren;  // String emoji or Lucide icon component
	suffix?: ComponentChildren; // Content to show after the label (e.g., delete button)
	onClick?: () => void;
	disabled?: boolean;
	danger?: boolean;
	divider?: boolean;
}

interface DropdownProps {
	trigger: ComponentChildren;
	items: DropdownItem[];
	align?: 'left' | 'right';
	className?: string;
}

export function Dropdown({
	trigger,
	items,
	align = 'left',
	className = ''
}: DropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Close on outside click
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		}
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [isOpen]);

	return (
		<div ref={containerRef} class={`v2-dropdown ${className}`}>
			<div class="v2-dropdown-trigger" onClick={() => setIsOpen(!isOpen)}>
				{trigger}
			</div>

			{isOpen && (
				<div class={`v2-dropdown-menu ${align === 'right' ? 'align-right' : ''}`}>
					{items.map(item => (
						item.divider ? (
							<div key={item.id} class="v2-dropdown-divider" />
						) : (
							<button
								key={item.id}
								type="button"
								class={`v2-dropdown-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`}
								onClick={() => {
									if (!item.disabled && item.onClick) {
										item.onClick();
										setIsOpen(false);
									}
								}}
								disabled={item.disabled}
							>
								{item.icon && <span class="v2-dropdown-icon">{item.icon}</span>}
								<span>{item.label}</span>
								{item.suffix}
							</button>
						)
					))}
				</div>
			)}
		</div>
	);
}
