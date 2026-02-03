/**
 * Trainees Tab
 * Grid display of saved uma builds with editable memos
 */

import { h } from 'preact';
import { useState, useCallback, useEffect, useRef, useMemo } from 'preact/hooks';
import { Button, Tooltip, Modal } from './components';
import { Save, Trash2, Upload, Users } from 'lucide-react';
import {
	SavedSlot,
	getAllSavedSlots,
	deleteHorseSlot,
	updateSlotMemo,
	saveHorseSlot,
} from './storage';
import type { UmaState } from './uma-panel';

import umas from '../umas.json';
import icons from '../../icons.json';

// ============================================
// SAVE TRAINEE MODAL
// ============================================

interface SaveTraineeModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (name: string) => void;
	defaultName: string;
}

function SaveTraineeModal({ isOpen, onClose, onSave, defaultName }: SaveTraineeModalProps) {
	const [name, setName] = useState(defaultName);
	const inputRef = useRef<HTMLInputElement>(null);

	// Reset and focus when modal opens
	useEffect(() => {
		if (isOpen) {
			setName(defaultName);
			setTimeout(() => inputRef.current?.select(), 50);
		}
	}, [isOpen, defaultName]);

	const handleSubmit = useCallback((e: Event) => {
		e.preventDefault();
		if (name.trim()) {
			onSave(name.trim());
			onClose();
		}
	}, [name, onSave, onClose]);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleSubmit(e);
		}
	}, [handleSubmit]);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Save Trainee"
			size="sm"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>Cancel</Button>
					<Button variant="primary" onClick={handleSubmit} disabled={!name.trim()}>
						Save
					</Button>
				</>
			}
		>
			<div class="v2-save-trainee-form">
				<label class="v2-save-trainee-label">
					Name
					<input
						ref={inputRef}
						type="text"
						class="v2-save-trainee-input"
						value={name}
						onInput={(e) => setName((e.target as HTMLInputElement).value)}
						onKeyDown={handleKeyDown}
						placeholder="Enter a name for this build"
					/>
				</label>
			</div>
		</Modal>
	);
}

// ============================================
// TRAINEE CARD
// ============================================

interface TraineeCardProps {
	slot: SavedSlot;
	onLoadToUma1: () => void;
	onLoadToUma2: () => void;
	onDelete: () => void;
	showUma2Button: boolean;  // Show in compare mode
}

// Random mob portrait for empty outfitId
const randomMobIcon = `/uma-tools/icons/mob/trained_mob_chr_icon_${8000 + Math.floor(Math.random() * 624)}_000001_01.png`;

function TraineeCard({ slot, onLoadToUma1, onLoadToUma2, onDelete, showUma2Button }: TraineeCardProps) {
	const [memo, setMemo] = useState(slot.memo || '');
	const [isEditing, setIsEditing] = useState(false);
	const memoTimeoutRef = useRef<number | null>(null);

	// Get portrait icon
	const portraitIcon = useMemo(() => {
		if (!slot.data.outfitId) return randomMobIcon;
		return (icons as Record<string, string>)[slot.data.outfitId] || randomMobIcon;
	}, [slot.data.outfitId]);

	// Get character name
	const characterName = useMemo(() => {
		if (!slot.data.outfitId) return slot.name;
		const uma = (umas as any)[slot.data.outfitId.slice(0, 4)];
		return uma?.name?.[1] || slot.name;
	}, [slot.data.outfitId, slot.name]);

	// Debounced memo save
	const handleMemoChange = useCallback((value: string) => {
		setMemo(value);

		if (memoTimeoutRef.current) {
			clearTimeout(memoTimeoutRef.current);
		}

		memoTimeoutRef.current = window.setTimeout(() => {
			updateSlotMemo(slot.name, value);
		}, 500);
	}, [slot.name]);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (memoTimeoutRef.current) {
				clearTimeout(memoTimeoutRef.current);
			}
		};
	}, []);

	const handleDelete = useCallback((e: MouseEvent) => {
		e.stopPropagation();
		if (confirm(`Delete "${slot.name}"?`)) {
			onDelete();
		}
	}, [slot.name, onDelete]);

	const { speed, stamina, power, guts, wisdom } = slot.data;

	return (
		<div class="v2-trainee-card">
			<div class="v2-trainee-card-content">
				{/* Portrait */}
				<img
					src={portraitIcon}
					alt={characterName}
					class="v2-trainee-portrait"
					loading="lazy"
				/>

				{/* Info section */}
				<div class="v2-trainee-info">
					<div class="v2-trainee-name" title={slot.name}>{slot.name}</div>

					{/* Editable memo */}
					<textarea
						class="v2-trainee-memo"
						placeholder="Add notes..."
						value={memo}
						onInput={(e) => handleMemoChange((e.target as HTMLTextAreaElement).value)}
						onFocus={() => setIsEditing(true)}
						onBlur={() => setIsEditing(false)}
						rows={1}
					/>

					{/* Compact stats preview */}
					<div class="v2-trainee-stats-preview">
						<span class="v2-trainee-stat">
							<img src="/uma-tools/icons/status_00.png" alt="SPD" class="v2-trainee-stat-icon" />
							{speed}
						</span>
						<span class="v2-trainee-stat">
							<img src="/uma-tools/icons/status_01.png" alt="STA" class="v2-trainee-stat-icon" />
							{stamina}
						</span>
						<span class="v2-trainee-stat">
							<img src="/uma-tools/icons/status_02.png" alt="POW" class="v2-trainee-stat-icon" />
							{power}
						</span>
						<span class="v2-trainee-stat">
							<img src="/uma-tools/icons/status_03.png" alt="GUT" class="v2-trainee-stat-icon" />
							{guts}
						</span>
						<span class="v2-trainee-stat">
							<img src="/uma-tools/icons/status_04.png" alt="WIS" class="v2-trainee-stat-icon" />
							{wisdom}
						</span>
					</div>
				</div>
			</div>

			{/* Actions */}
			<div class="v2-trainee-actions">
				<button class="v2-trainee-load-btn uma1" onClick={onLoadToUma1}>
					Load{showUma2Button ? ' Uma 1' : ''}
				</button>
				{showUma2Button && (
					<button class="v2-trainee-load-btn uma2" onClick={onLoadToUma2}>
						Load Uma 2
					</button>
				)}
				<Tooltip content="Delete" position="top">
					<button class="v2-trainee-delete-btn" onClick={handleDelete}>
						<Trash2 size={14} />
					</button>
				</Tooltip>
			</div>
		</div>
	);
}

// ============================================
// TRAINEES TAB
// ============================================

interface TraineesTabProps {
	onLoadToUma1: (state: UmaState) => void;
	onLoadToUma2: (state: UmaState) => void;
	currentMode: 'compare' | 'chart';
	currentUma1: UmaState;
	currentUma2: UmaState;
}

export function TraineesTab({
	onLoadToUma1,
	onLoadToUma2,
	currentMode,
	currentUma1,
	currentUma2,
}: TraineesTabProps) {
	const [slots, setSlots] = useState<SavedSlot[]>([]);
	const [saveModalOpen, setSaveModalOpen] = useState(false);
	const [saveTarget, setSaveTarget] = useState<1 | 2>(1);

	// Load slots on mount
	const refreshSlots = useCallback(() => {
		setSlots(getAllSavedSlots());
	}, []);

	useEffect(() => {
		refreshSlots();
	}, [refreshSlots]);

	// Get default name for save modal
	const getDefaultName = useCallback((umaNumber: 1 | 2) => {
		const uma = umaNumber === 1 ? currentUma1 : currentUma2;
		if (uma.outfitId) {
			const umaData = (umas as any)[uma.outfitId.slice(0, 4)];
			if (umaData?.name?.[1]) {
				return umaData.name[1];
			}
		}
		return `Build ${slots.length + 1}`;
	}, [currentUma1, currentUma2, slots.length]);

	// Open save modal
	const handleOpenSaveModal = useCallback((umaNumber: 1 | 2) => {
		setSaveTarget(umaNumber);
		setSaveModalOpen(true);
	}, []);

	// Perform save
	const handleSave = useCallback((name: string) => {
		const uma = saveTarget === 1 ? currentUma1 : currentUma2;
		saveHorseSlot(name, uma, '');
		refreshSlots();
	}, [saveTarget, currentUma1, currentUma2, refreshSlots]);

	const handleDelete = useCallback((name: string) => {
		deleteHorseSlot(name);
		refreshSlots();
	}, [refreshSlots]);

	const handleLoadToUma1 = useCallback((data: UmaState) => {
		onLoadToUma1(data);
	}, [onLoadToUma1]);

	const handleLoadToUma2 = useCallback((data: UmaState) => {
		onLoadToUma2(data);
	}, [onLoadToUma2]);

	const showUma2Button = currentMode === 'compare';

	return (
		<div class="v2-trainees-tab">
			{/* Header */}
			<div class="v2-trainees-header">
				<div class="v2-trainees-title">
					<Users size={16} />
					<span>Saved Builds ({slots.length})</span>
				</div>
				<div class="v2-trainees-save-buttons">
					<Button
						variant="primary"
						size="sm"
						onClick={() => handleOpenSaveModal(1)}
						icon={<Save size={12} />}
					>
						Save Trainee{showUma2Button ? ' (1)' : ''}
					</Button>
					{showUma2Button && (
						<Button
							variant="secondary"
							size="sm"
							onClick={() => handleOpenSaveModal(2)}
							icon={<Save size={12} />}
						>
							Save Trainee (2)
						</Button>
					)}
				</div>
			</div>

			{/* Grid or Empty State */}
			{slots.length === 0 ? (
				<div class="v2-trainees-empty">
					<Upload size={48} strokeWidth={1} />
					<p>No saved builds yet</p>
					<p class="v2-trainees-empty-hint">
						Configure an uma and click "Save Trainee" to save your first build
					</p>
				</div>
			) : (
				<div class="v2-trainees-grid">
					{slots.map(slot => (
						<TraineeCard
							key={slot.name}
							slot={slot}
							onLoadToUma1={() => handleLoadToUma1(slot.data)}
							onLoadToUma2={() => handleLoadToUma2(slot.data)}
							onDelete={() => handleDelete(slot.name)}
							showUma2Button={showUma2Button}
						/>
					))}
				</div>
			)}

			{/* Save Modal */}
			<SaveTraineeModal
				isOpen={saveModalOpen}
				onClose={() => setSaveModalOpen(false)}
				onSave={handleSave}
				defaultName={getDefaultName(saveTarget)}
			/>
		</div>
	);
}
