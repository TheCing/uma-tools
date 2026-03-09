/**
 * Icon Select Component
 * For selecting from icon-based options (aptitudes, moods, etc.)
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, Fragment } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { ChevronDown } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface DropdownPosition {
	top: number;
	left: number;
	width: number;
}

export interface IconOption {
	value: string | number;
	iconSrc: string;
	label?: string;  // Optional label shown on hover/tooltip
}

interface IconSelectProps {
	value: string | number;
	onChange: (value: string | number) => void;
	options: IconOption[];
	className?: string;
	iconSize?: number;  // Size of icons in pixels (height when autoWidth)
	horizontal?: boolean;  // Layout options horizontally
	autoWidth?: boolean;  // If true, icons have auto width with fixed height
}

export function IconSelect({
	value,
	onChange,
	options,
	className = '',
	iconSize = 24,
	horizontal = true,
	autoWidth = false
}: IconSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [position, setPosition] = useState<DropdownPosition | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const selectedOption = options.find(opt => opt.value === value);

	// Calculate dropdown position when opening
	useLayoutEffect(() => {
		if (isOpen && triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			const isMobile = window.innerWidth <= 768;
			setPosition({
				top: rect.bottom + 4,
				left: rect.left,
				width: isMobile ? 0 : (horizontal ? Math.max(rect.width, options.length * (iconSize + 8) + 16) : rect.width)
			});
		}
	}, [isOpen, horizontal, options.length, iconSize]);

	// Close on outside click
	useEffect(() => {
		function handleClickOutside(e: Event) {
			const target = e.target as Node;
			const clickedContainer = containerRef.current?.contains(target);
			const clickedDropdown = dropdownRef.current?.contains(target);
			if (!clickedContainer && !clickedDropdown) {
				setIsOpen(false);
			}
		}
		if (isOpen) {
			document.addEventListener('pointerdown', handleClickOutside);
			return () => document.removeEventListener('pointerdown', handleClickOutside);
		}
	}, [isOpen]);

	// Close on escape
	useEffect(() => {
		function handleEscape(e: KeyboardEvent) {
			if (e.key === 'Escape') setIsOpen(false);
		}
		if (isOpen) {
			document.addEventListener('keydown', handleEscape);
			return () => document.removeEventListener('keydown', handleEscape);
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		function handleScroll() { setIsOpen(false); }
		window.addEventListener('scroll', handleScroll, true);
		return () => window.removeEventListener('scroll', handleScroll, true);
	}, [isOpen]);

	// Keyboard shortcut: type a letter/number to select matching option
	const handleKeyDown = (e: KeyboardEvent) => {
		const key = e.key.toUpperCase();
		const match = options.find(opt => String(opt.value).toUpperCase() === key);
		if (match) {
			e.preventDefault();
			onChange(match.value);
		}
	};

	const dropdownContent = isOpen && position && createPortal(
		<div
			ref={dropdownRef}
			class={`v2-icon-select-dropdown ${(horizontal && position.width > 0) ? 'horizontal' : 'vertical'}`}
			style={{
				position: 'fixed',
				top: `${position.top}px`,
				left: `${position.left}px`,
				...(position.width > 0 ? { minWidth: `${position.width}px` } : {})
			}}
		>
			{options.map(option => (
				<Tooltip key={option.value} content={option.label || ''} position="bottom" delay={200}>
					<button
						type="button"
						class={`v2-icon-select-option ${option.value === value ? 'selected' : ''}`}
						onClick={() => {
							onChange(option.value);
							setIsOpen(false);
						}}
					>
						<img
							src={option.iconSrc}
							alt={option.label || String(option.value)}
							style={{ width: autoWidth ? 'auto' : `${iconSize}px`, height: `${iconSize}px` }}
						/>
					</button>
				</Tooltip>
			))}
		</div>,
		document.body
	);

	return (
		<>
			<div
				ref={containerRef}
				class={`v2-icon-select ${isOpen ? 'open' : ''} ${className}`}
			>
				<Tooltip content={selectedOption?.label || ''} position="bottom">
					<button
						ref={triggerRef}
						type="button"
						class="v2-icon-select-trigger"
						onClick={() => setIsOpen(!isOpen)}
						onKeyDown={handleKeyDown}
					>
						{selectedOption && (
							<img
								src={selectedOption.iconSrc}
								alt={selectedOption.label || String(selectedOption.value)}
								style={{ width: autoWidth ? 'auto' : `${iconSize}px`, height: `${iconSize}px` }}
							/>
						)}
						<ChevronDown class="v2-icon-select-chevron" size={12} color="#a8aebb" />
					</button>
				</Tooltip>
			</div>
			{dropdownContent}
		</>
	);
}
