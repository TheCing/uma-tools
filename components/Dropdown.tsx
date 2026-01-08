import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';

import './Dropdown.css';

export interface DropdownOption {
	value: string;
	label: string;
}

interface DropdownProps {
	options: DropdownOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	tabindex?: number;
}

export function Dropdown({ options, value, onChange, placeholder = 'Select...', disabled = false, tabindex }: DropdownProps) {
	const [open, setOpen] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	const selectedOption = options.find(opt => opt.value === value);

	function handleToggle() {
		if (!disabled) {
			setOpen(!open);
			if (!open) {
				// When opening, focus the selected item or first item
				const idx = options.findIndex(opt => opt.value === value);
				setFocusedIndex(idx >= 0 ? idx : 0);
			}
		}
	}

	function handleSelect(optionValue: string) {
		onChange(optionValue);
		setOpen(false);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (disabled) return;

		switch (e.key) {
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (open && focusedIndex >= 0) {
					handleSelect(options[focusedIndex].value);
				} else {
					setOpen(!open);
				}
				break;
			case 'Escape':
				setOpen(false);
				break;
			case 'ArrowDown':
				e.preventDefault();
				if (!open) {
					setOpen(true);
					setFocusedIndex(0);
				} else {
					setFocusedIndex(prev => Math.min(prev + 1, options.length - 1));
				}
				break;
			case 'ArrowUp':
				e.preventDefault();
				if (open) {
					setFocusedIndex(prev => Math.max(prev - 1, 0));
				}
				break;
			case 'Tab':
				setOpen(false);
				break;
		}
	}

	function handleBlur(e: FocusEvent) {
		// Check if the new focus target is outside the dropdown
		if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node)) {
			setOpen(false);
		}
	}

	// Scroll focused item into view
	useEffect(() => {
		if (open && listRef.current && focusedIndex >= 0) {
			const items = listRef.current.querySelectorAll('li');
			if (items[focusedIndex]) {
				items[focusedIndex].scrollIntoView({ block: 'nearest' });
			}
		}
	}, [focusedIndex, open]);

	return (
		<div
			class={`dropdown ${open ? 'dropdown--open' : ''} ${disabled ? 'dropdown--disabled' : ''}`}
			ref={containerRef}
			tabIndex={disabled ? -1 : (tabindex ?? 0)}
			onClick={handleToggle}
			onKeyDown={handleKeyDown}
			onBlur={handleBlur}
		>
			<div class="dropdown__selected">
				<span class="dropdown__selected-text">
					{selectedOption ? selectedOption.label : placeholder}
				</span>
				<span class="dropdown__arrow" />
			</div>
			<ul
				class="dropdown__list"
				ref={listRef}
				role="listbox"
			>
				{options.map((option, index) => (
					<li
						key={option.value}
						class={`dropdown__option ${option.value === value ? 'dropdown__option--selected' : ''} ${index === focusedIndex ? 'dropdown__option--focused' : ''}`}
						role="option"
						aria-selected={option.value === value}
						onMouseDown={(e) => {
							e.preventDefault();
							handleSelect(option.value);
						}}
						onMouseEnter={() => setFocusedIndex(index)}
					>
						{option.label}
					</li>
				))}
			</ul>
		</div>
	);
}
