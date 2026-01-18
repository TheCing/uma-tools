import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

import './SlotDialog.css';

interface SlotDialogProps {
	open: boolean;
	title: string;
	message?: string;
	mode: 'prompt' | 'confirm';
	placeholder?: string;
	defaultValue?: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: (value?: string) => void;
	onCancel: () => void;
}

export function SlotDialog(props: SlotDialogProps) {
	const [inputValue, setInputValue] = useState(props.defaultValue || '');
	const inputRef = useRef<HTMLInputElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (props.open) {
			setInputValue(props.defaultValue || '');
			// Focus input or dialog after opening
			setTimeout(() => {
				if (props.mode === 'prompt' && inputRef.current) {
					inputRef.current.focus();
					inputRef.current.select();
				} else if (dialogRef.current) {
					dialogRef.current.focus();
				}
			}, 50);
		}
	}, [props.open, props.defaultValue]);

	function handleConfirm() {
		if (props.mode === 'prompt') {
			if (inputValue.trim()) {
				props.onConfirm(inputValue.trim());
			}
		} else {
			props.onConfirm();
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleConfirm();
		} else if (e.key === 'Escape') {
			props.onCancel();
		}
	}

	if (!props.open) return null;

	return (
		<div className="slotDialogOverlay" onClick={props.onCancel}>
			<div
				className="slotDialog"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={handleKeyDown}
				tabIndex={-1}
				ref={dialogRef}
			>
				<div className="slotDialogHeader">
					<h3>{props.title}</h3>
				</div>
				<div className="slotDialogContent">
					{props.message && <p>{props.message}</p>}
					{props.mode === 'prompt' && (
						<input
							type="text"
							className="slotDialogInput"
							placeholder={props.placeholder || 'Enter name...'}
							value={inputValue}
							onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
							ref={inputRef}
						/>
					)}
				</div>
				<div className="slotDialogButtons">
					<button className="slotDialogCancel" onClick={props.onCancel}>
						{props.cancelText || 'Cancel'}
					</button>
					<button
						className="slotDialogConfirm"
						onClick={handleConfirm}
						disabled={props.mode === 'prompt' && !inputValue.trim()}
					>
						{props.confirmText || 'OK'}
					</button>
				</div>
			</div>
		</div>
	);
}
