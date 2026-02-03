/**
 * Custom Select Component
 * Portal-based dropdown for proper z-index handling
 */

import { h, Fragment } from 'preact';
import { createPortal } from 'preact/compat';
import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
	value: string | number | null;
	label: string;
	disabled?: boolean;
}

interface DropdownPosition {
	top: number;
	left: number;
	width: number;
}

interface CustomSelectProps {
	value: string | number | null;
	onChange: (value: string | number | null) => void;
	options: SelectOption[];
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}

export function CustomSelect({
	value,
	onChange,
	options,
	placeholder = 'Select...',
	disabled = false,
	className = ''
}: CustomSelectProps) {
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
			setPosition({
				top: rect.bottom + 4,
				left: rect.left,
				width: rect.width
			});
		}
	}, [isOpen]);

	// Close on outside click (check both container and portal dropdown)
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			const clickedContainer = containerRef.current?.contains(target);
			const clickedDropdown = dropdownRef.current?.contains(target);
			if (!clickedContainer && !clickedDropdown) {
				setIsOpen(false);
			}
		}
		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
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

	// Close on scroll outside dropdown (but allow scrolling inside)
	useEffect(() => {
		function handleScroll(e: Event) {
			// Don't close if scrolling inside the dropdown
			if (dropdownRef.current?.contains(e.target as Node)) {
				return;
			}
			setIsOpen(false);
		}
		if (isOpen) {
			window.addEventListener('scroll', handleScroll, true);
			return () => window.removeEventListener('scroll', handleScroll, true);
		}
	}, [isOpen]);

	const dropdownContent = isOpen && position && createPortal(
		<div
			ref={dropdownRef}
			class="v2-select-dropdown v2-select-dropdown-portal"
			style={{
				position: 'fixed',
				top: `${position.top}px`,
				left: `${position.left}px`,
				width: `${position.width}px`
			}}
		>
			{options.map(option => (
				<button
					key={String(option.value)}
					type="button"
					class={`v2-select-option ${option.value === value ? 'selected' : ''} ${option.disabled ? 'disabled' : ''}`}
					onClick={() => {
						if (!option.disabled) {
							onChange(option.value);
							setIsOpen(false);
						}
					}}
					disabled={option.disabled}
				>
					{option.label}
					{option.value === value && <Check class="v2-select-check" size={14} />}
				</button>
			))}
		</div>,
		document.body
	);

	return (
		<>
			<div
				ref={containerRef}
				class={`v2-select ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`}
			>
				<button
					ref={triggerRef}
					type="button"
					class="v2-select-trigger"
					onClick={() => !disabled && setIsOpen(!isOpen)}
					disabled={disabled}
				>
					<span class="v2-select-value">
						{selectedOption ? selectedOption.label : placeholder}
					</span>
					<ChevronDown class="v2-select-chevron" size={14} />
				</button>
			</div>
			{dropdownContent}
		</>
	);
}
