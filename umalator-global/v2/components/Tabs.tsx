/**
 * Tabs Component
 * Accessible tab list with roving keyboard focus and panel rendering.
 * Controlled via activeId / onChange; panels render only the active tab's content.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

export interface TabItem {
	id: string;
	label: ComponentChildren;
	icon?: ComponentChildren;
	disabled?: boolean;
	content?: ComponentChildren;
}

interface TabsProps {
	items: TabItem[];
	activeId: string;
	onChange: (id: string) => void;
	variant?: 'line' | 'pill' | 'segmented';
	size?: 'sm' | 'md';
	fullWidth?: boolean;
	className?: string;
	ariaLabel?: string;
}

export function Tabs({
	items,
	activeId,
	onChange,
	variant = 'line',
	size = 'md',
	fullWidth = false,
	className = '',
	ariaLabel,
}: TabsProps) {
	const listRef = useRef<HTMLDivElement>(null);

	function focusTab(index: number) {
		const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])');
		if (!tabs) return;
		const clamped = (index + tabs.length) % tabs.length;
		tabs[clamped]?.focus();
	}

	function handleKeyDown(e: KeyboardEvent, index: number) {
		const enabledItems = items.filter(i => !i.disabled);
		const currentPos = enabledItems.findIndex(i => i.id === items[index].id);
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			const next = enabledItems[(currentPos + 1) % enabledItems.length];
			onChange(next.id);
			focusTab((currentPos + 1) % enabledItems.length);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			const prev = enabledItems[(currentPos - 1 + enabledItems.length) % enabledItems.length];
			onChange(prev.id);
			focusTab((currentPos - 1 + enabledItems.length) % enabledItems.length);
		} else if (e.key === 'Home') {
			e.preventDefault();
			onChange(enabledItems[0].id);
			focusTab(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			onChange(enabledItems[enabledItems.length - 1].id);
			focusTab(enabledItems.length - 1);
		}
	}

	const activeItem = items.find(i => i.id === activeId);

	return (
		<div class={`v2-tabs v2-tabs-${variant} v2-tabs-${size} ${fullWidth ? 'full-width' : ''} ${className}`}>
			<div
				ref={listRef}
				class="v2-tabs-list"
				role="tablist"
				aria-label={ariaLabel}
			>
				{items.map((item, index) => {
					const selected = item.id === activeId;
					return (
						<button
							key={item.id}
							type="button"
							role="tab"
							id={`tab-${item.id}`}
							aria-selected={selected}
							aria-controls={`tabpanel-${item.id}`}
							tabIndex={selected ? 0 : -1}
							disabled={item.disabled}
							class={`v2-tab ${selected ? 'active' : ''}`}
							onClick={() => !item.disabled && onChange(item.id)}
							onKeyDown={(e) => handleKeyDown(e, index)}
						>
							{item.icon && <span class="v2-tab-icon">{item.icon}</span>}
							<span class="v2-tab-label">{item.label}</span>
						</button>
					);
				})}
			</div>
			{activeItem?.content !== undefined && (
				<div
					id={`tabpanel-${activeItem.id}`}
					role="tabpanel"
					aria-labelledby={`tab-${activeItem.id}`}
					class="v2-tab-panel"
				>
					{activeItem.content}
				</div>
			)}
		</div>
	);
}
