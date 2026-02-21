/**
 * Modal Component
 * Base modal with header, body, and footer sections
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { X } from 'lucide-react';

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title?: string;
	children: ComponentChildren;
	footer?: ComponentChildren;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	closeOnBackdrop?: boolean;
	closeOnEscape?: boolean;
	className?: string;
}

export function Modal({
	isOpen,
	onClose,
	title,
	children,
	footer,
	size = 'md',
	closeOnBackdrop = true,
	closeOnEscape = true,
	className = ''
}: ModalProps) {
	// Close on escape
	useEffect(() => {
		function handleEscape(e: KeyboardEvent) {
			if (e.key === 'Escape' && closeOnEscape) {
				onClose();
			}
		}
		if (isOpen) {
			document.addEventListener('keydown', handleEscape);
			document.body.style.overflow = 'hidden';
			return () => {
				document.removeEventListener('keydown', handleEscape);
				document.body.style.overflow = '';
			};
		}
	}, [isOpen, closeOnEscape, onClose]);

	if (!isOpen) return null;

	return (
		<div class="v2-modal-overlay" onClick={closeOnBackdrop ? onClose : undefined}>
			<div
				class={`v2-modal v2-modal-${size} ${className}`}
				onClick={e => e.stopPropagation()}
			>
				{title && (
					<div class="v2-modal-header">
						<h2 class="v2-modal-title">{title}</h2>
						<button
							type="button"
							class="v2-modal-close"
							onClick={onClose}
							aria-label="Close"
						>
							<X size={16} />
						</button>
					</div>
				)}

				<div class="v2-modal-body">
					{children}
				</div>

				{footer && (
					<div class="v2-modal-footer">
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}
