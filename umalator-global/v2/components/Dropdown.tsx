/**
 * Dropdown Menu Component
 * For action menus and settings
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';

export interface DropdownItem {
	id: string;
	label: string;
	icon?: ComponentChildren;  // String emoji or Lucide icon component
	suffix?: ComponentChildren; // Content to show after the label (e.g., delete button)
	onClick?: () => void;
	disabled?: boolean;
	danger?: boolean;
	divider?: boolean;
	custom?: ComponentChildren; // Custom content that replaces the entire item
	keepOpen?: boolean; // Don't close dropdown when this item is clicked
}

interface DropdownProps {
	trigger: ComponentChildren;
	items: DropdownItem[];
	align?: 'left' | 'right';
	className?: string;
	portal?: boolean;
}

export function Dropdown({
	trigger,
	items,
	align = 'left',
	className = '',
	portal = false
}: DropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

	// Calculate position for portal mode
	useEffect(() => {
		if (isOpen && portal && containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			setPosition({
				top: rect.bottom + 4,
				left: align === 'right' ? rect.right : rect.left
			});
		}
	}, [isOpen, portal, align]);

	// Close on outside click
	useEffect(() => {
		function handleClickOutside(e: Event) {
			const target = e.target as Node;
			const clickedContainer = containerRef.current?.contains(target);
			const clickedMenu = menuRef.current?.contains(target);
			if (!clickedContainer && !clickedMenu) {
				setIsOpen(false);
			}
		}
		if (isOpen) {
			document.addEventListener('pointerdown', handleClickOutside);
			return () => document.removeEventListener('pointerdown', handleClickOutside);
		}
	}, [isOpen]);

	// Close on scroll when using portal
	useEffect(() => {
		if (!isOpen || !portal) return;
		function handleScroll(e: Event) {
			if (menuRef.current?.contains(e.target as Node)) return;
			setIsOpen(false);
		}
		window.addEventListener('scroll', handleScroll, true);
		return () => window.removeEventListener('scroll', handleScroll, true);
	}, [isOpen, portal]);

	const menuContent = (
		<div
			ref={menuRef}
			class={`v2-dropdown-menu ${align === 'right' ? 'align-right' : ''}`}
			style={portal && position ? {
				position: 'fixed',
				top: `${position.top}px`,
				left: align === 'right' ? 'auto' : `${position.left}px`,
				right: align === 'right' ? `${window.innerWidth - position.left}px` : 'auto'
			} : undefined}
		>
			{items.map(item => (
				item.divider ? (
					<div key={item.id} class="v2-dropdown-divider" />
				) : item.custom ? (
					<div key={item.id} class="v2-dropdown-custom">
						{item.custom}
					</div>
				) : (
					<button
						key={item.id}
						type="button"
						class={`v2-dropdown-item ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`}
						onClick={() => {
							if (!item.disabled && item.onClick) {
								item.onClick();
								if (!item.keepOpen) setIsOpen(false);
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
	);

	return (
		<div ref={containerRef} class={`v2-dropdown ${className}`}>
			<div class="v2-dropdown-trigger" onClick={() => setIsOpen(!isOpen)}>
				{trigger}
			</div>

			{isOpen && (portal ? (position && createPortal(menuContent, document.body)) : menuContent)}
		</div>
	);
}
