/**
 * Trainees Tab
 * Grid display of saved uma builds with folder organization
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { useState, useCallback, useEffect, useRef, useMemo } from 'preact/hooks';
import { Button, Tooltip, Modal, Dropdown } from './components';
import type { DropdownItem } from './components';
import { Save, Trash2, Upload, Users, FolderPlus, Folder, FolderOpen, ChevronRight, ChevronDown, ArrowLeft, Layers, List } from 'lucide-react';
import {
	SavedSlot,
	TraineeFolder,
	getAllSavedSlots,
	deleteHorseSlot,
	updateSlotMemo,
	saveHorseSlot,
	getFolders,
	createFolder,
	deleteFolder,
	renameFolder,
	moveSlotToFolder,
	toggleFolderCollapsed,
} from './storage';
import { TraineeCardPreview } from './trainee-card-preview';
import type { UmaState } from './uma-panel';

import umas from '../umas.json';

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
// CREATE FOLDER MODAL
// ============================================

interface CreateFolderModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreate: (name: string) => void;
}

function CreateFolderModal({ isOpen, onClose, onCreate }: CreateFolderModalProps) {
	const [name, setName] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isOpen) {
			setName('');
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	const handleSubmit = useCallback((e: Event) => {
		e.preventDefault();
		if (name.trim()) {
			onCreate(name.trim());
			onClose();
		}
	}, [name, onCreate, onClose]);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === 'Enter') handleSubmit(e);
	}, [handleSubmit]);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="New Folder"
			size="sm"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>Cancel</Button>
					<Button variant="primary" onClick={handleSubmit} disabled={!name.trim()}>
						Create
					</Button>
				</>
			}
		>
			<div class="v2-save-trainee-form">
				<label class="v2-save-trainee-label">
					Folder Name
					<input
						ref={inputRef}
						type="text"
						class="v2-save-trainee-input"
						value={name}
						onInput={(e) => setName((e.target as HTMLInputElement).value)}
						onKeyDown={handleKeyDown}
						placeholder="e.g. CM Builds"
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
	onMoveToFolder: (folder: string | null) => void;
	showUma2Button: boolean;
	folders: TraineeFolder[];
}

function TraineeCard({ slot, onLoadToUma1, onLoadToUma2, onDelete, onMoveToFolder, showUma2Button, folders }: TraineeCardProps) {
	const [memo, setMemo] = useState(slot.memo || '');
	const memoTimeoutRef = useRef<number | null>(null);

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

	return (
		<div class="v2-trainee-card">
			<TraineeCardPreview data={slot.data} name={slot.name}>
				<textarea
					class="v2-trainee-memo"
					placeholder="Add notes..."
					value={memo}
					onInput={(e) => handleMemoChange((e.target as HTMLTextAreaElement).value)}
					rows={1}
				/>
			</TraineeCardPreview>

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
				{folders.length > 0 && (
					<Dropdown
						trigger={
							<button class="v2-trainee-load-btn v2-trainee-move-btn">
								<Folder size={14} /> Move
							</button>
						}
						align="right"
						portal
						items={[
							{ id: '_none', label: 'No folder', icon: '—', onClick: () => onMoveToFolder(null) },
							...folders.map(f => ({
								id: f.name,
								label: f.name,
								icon: <Folder size={14} />,
								onClick: () => onMoveToFolder(f.name),
							} as DropdownItem))
						]}
					/>
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
// FOLDER SECTION (collapsible view)
// ============================================

interface FolderSectionProps {
	folder: TraineeFolder;
	slots: SavedSlot[];
	onToggle: () => void;
	onDelete: () => void;
	onRename: (newName: string) => void;
	children: any;
}

function FolderSection({ folder, slots, onToggle, onDelete, onRename, children }: FolderSectionProps) {
	const [editing, setEditing] = useState(false);
	const [editName, setEditName] = useState(folder.name);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleStartEdit = useCallback(() => {
		setEditName(folder.name);
		setEditing(true);
		setTimeout(() => inputRef.current?.select(), 50);
	}, [folder.name]);

	const handleFinishEdit = useCallback(() => {
		setEditing(false);
		if (editName.trim() && editName.trim() !== folder.name) {
			onRename(editName.trim());
		}
	}, [editName, folder.name, onRename]);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		if (e.key === 'Enter') handleFinishEdit();
		if (e.key === 'Escape') setEditing(false);
	}, [handleFinishEdit]);

	const handleDeleteFolder = useCallback((e: MouseEvent) => {
		e.stopPropagation();
		if (confirm(`Delete folder "${folder.name}"? Builds inside will be ungrouped, not deleted.`)) {
			onDelete();
		}
	}, [folder.name, onDelete]);

	return (
		<div class="v2-folder-section">
			<div class="v2-folder-section-header" onClick={onToggle}>
				<div class="v2-folder-section-left">
					{folder.collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
					{folder.collapsed ? <Folder size={16} /> : <FolderOpen size={16} />}
					{editing ? (
						<input
							ref={inputRef}
							class="v2-folder-rename-input"
							value={editName}
							onInput={(e) => setEditName((e.target as HTMLInputElement).value)}
							onBlur={handleFinishEdit}
							onKeyDown={handleKeyDown}
							onClick={(e) => e.stopPropagation()}
						/>
					) : (
						<span class="v2-folder-name" onDblClick={(e) => { e.stopPropagation(); handleStartEdit(); }}>
							{folder.name}
						</span>
					)}
					<span class="v2-folder-count">{slots.length}</span>
				</div>
				<Tooltip content="Delete folder" position="top">
					<button class="v2-folder-delete-btn" onClick={handleDeleteFolder}>
						<Trash2 size={14} />
					</button>
				</Tooltip>
			</div>
			{!folder.collapsed && (
				<div class="v2-folder-section-content">
					{children}
				</div>
			)}
		</div>
	);
}

// ============================================
// FOLDER CARD (drill-down view)
// ============================================

interface FolderCardProps {
	folder: TraineeFolder;
	count: number;
	onClick: () => void;
	onDelete: () => void;
}

function FolderCard({ folder, count, onClick, onDelete }: FolderCardProps) {
	const handleDelete = useCallback((e: MouseEvent) => {
		e.stopPropagation();
		if (confirm(`Delete folder "${folder.name}"? Builds inside will be ungrouped, not deleted.`)) {
			onDelete();
		}
	}, [folder.name, onDelete]);

	return (
		<div class="v2-folder-card" onClick={onClick}>
			<div class="v2-folder-card-icon">
				<Folder size={32} />
			</div>
			<div class="v2-folder-card-info">
				<span class="v2-folder-card-name">{folder.name}</span>
				<span class="v2-folder-card-count">{count} build{count !== 1 ? 's' : ''}</span>
			</div>
			<Tooltip content="Delete folder" position="top">
				<button class="v2-folder-card-delete" onClick={handleDelete}>
					<Trash2 size={14} />
				</button>
			</Tooltip>
		</div>
	);
}

// ============================================
// TRAINEES TAB
// ============================================

type ViewMode = 'sections' | 'drilldown';

interface TraineesTabProps {
	onLoadToUma1: (state: UmaState) => void;
	onLoadToUma2: (state: UmaState) => void;
	currentMode: 'compare' | 'skill' | 'stamina';
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
	const [folders, setFolders] = useState<TraineeFolder[]>([]);
	const [saveModalOpen, setSaveModalOpen] = useState(false);
	const [folderModalOpen, setFolderModalOpen] = useState(false);
	const [saveTarget, setSaveTarget] = useState<1 | 2>(1);
	const [viewMode, setViewMode] = useState<ViewMode>('sections');
	const [drilldownFolder, setDrilldownFolder] = useState<string | null>(null);

	// Load slots and folders on mount
	const refresh = useCallback(() => {
		setSlots(getAllSavedSlots());
		setFolders(getFolders());
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	// Group slots by folder
	const { ungrouped, grouped } = useMemo(() => {
		const ungrouped: SavedSlot[] = [];
		const grouped: Map<string, SavedSlot[]> = new Map();

		for (const folder of folders) {
			grouped.set(folder.name, []);
		}

		for (const slot of slots) {
			if (slot.folder && grouped.has(slot.folder)) {
				grouped.get(slot.folder)!.push(slot);
			} else {
				ungrouped.push(slot);
			}
		}

		return { ungrouped, grouped };
	}, [slots, folders]);

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

	const handleOpenSaveModal = useCallback((umaNumber: 1 | 2) => {
		setSaveTarget(umaNumber);
		setSaveModalOpen(true);
	}, []);

	const handleSave = useCallback((name: string) => {
		const uma = saveTarget === 1 ? currentUma1 : currentUma2;
		// If in drill-down mode inside a folder, save into that folder
		const folder = viewMode === 'drilldown' && drilldownFolder ? drilldownFolder : undefined;
		saveHorseSlot(name, uma, '', folder);
		refresh();
	}, [saveTarget, currentUma1, currentUma2, refresh, viewMode, drilldownFolder]);

	const handleDelete = useCallback((name: string) => {
		deleteHorseSlot(name);
		refresh();
	}, [refresh]);

	const handleCreateFolder = useCallback((name: string) => {
		createFolder(name);
		refresh();
	}, [refresh]);

	const handleDeleteFolder = useCallback((name: string) => {
		deleteFolder(name);
		if (drilldownFolder === name) setDrilldownFolder(null);
		refresh();
	}, [refresh, drilldownFolder]);

	const handleRenameFolder = useCallback((oldName: string, newName: string) => {
		renameFolder(oldName, newName);
		if (drilldownFolder === oldName) setDrilldownFolder(newName);
		refresh();
	}, [refresh, drilldownFolder]);

	const handleMoveToFolder = useCallback((slotName: string, folder: string | null) => {
		moveSlotToFolder(slotName, folder);
		refresh();
	}, [refresh]);

	const handleToggleFolder = useCallback((name: string) => {
		toggleFolderCollapsed(name);
		setFolders(getFolders());
	}, []);

	const handleLoadToUma1 = useCallback((data: UmaState) => {
		onLoadToUma1(data);
	}, [onLoadToUma1]);

	const handleLoadToUma2 = useCallback((data: UmaState) => {
		onLoadToUma2(data);
	}, [onLoadToUma2]);

	const showUma2Button = currentMode === 'compare';

	// Render a grid of trainee cards
	const renderCards = (cardSlots: SavedSlot[]) => (
		<div class="v2-trainees-grid">
			{cardSlots.map(slot => (
				<TraineeCard
					key={slot.name}
					slot={slot}
					onLoadToUma1={() => handleLoadToUma1(slot.data)}
					onLoadToUma2={() => handleLoadToUma2(slot.data)}
					onDelete={() => handleDelete(slot.name)}
					onMoveToFolder={(f) => handleMoveToFolder(slot.name, f)}
					showUma2Button={showUma2Button}
					folders={folders}
				/>
			))}
		</div>
	);

	// Drill-down: inside a folder
	if (viewMode === 'drilldown' && drilldownFolder) {
		const folderSlots = grouped.get(drilldownFolder) || [];
		return (
			<div class="v2-trainees-tab">
				<div class="v2-trainees-header">
					<div class="v2-trainees-title">
						<button class="v2-folder-back-btn" onClick={() => setDrilldownFolder(null)}>
							<ArrowLeft size={16} />
						</button>
						<FolderOpen size={16} />
						<span>{drilldownFolder} ({folderSlots.length})</span>
					</div>
					<div class="v2-trainees-save-buttons">
						<Button
							variant="primary"
							size="sm"
							onClick={() => handleOpenSaveModal(1)}
							icon={<Save size={12} />}
						>
							Save{showUma2Button ? ' (1)' : ''}
						</Button>
						{showUma2Button && (
							<Button
								variant="secondary"
								size="sm"
								onClick={() => handleOpenSaveModal(2)}
								icon={<Save size={12} />}
							>
								Save (2)
							</Button>
						)}
					</div>
				</div>

				{folderSlots.length === 0 ? (
					<div class="v2-trainees-empty">
						<FolderOpen size={48} strokeWidth={1} />
						<p>This folder is empty</p>
						<p class="v2-trainees-empty-hint">
							Move builds here or save a new one
						</p>
					</div>
				) : renderCards(folderSlots)}

				<SaveTraineeModal
					isOpen={saveModalOpen}
					onClose={() => setSaveModalOpen(false)}
					onSave={handleSave}
					defaultName={getDefaultName(saveTarget)}
				/>
			</div>
		);
	}

	// Main view (sections or drill-down root)
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
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setFolderModalOpen(true)}
						icon={<FolderPlus size={12} />}
					>
						New Folder
					</Button>
					<Tooltip content={viewMode === 'sections' ? 'Switch to folder view' : 'Switch to section view'} position="top">
						<button
							class="v2-view-toggle-btn"
							onClick={() => setViewMode(v => v === 'sections' ? 'drilldown' : 'sections')}
						>
							{viewMode === 'sections' ? <Layers size={16} /> : <List size={16} />}
						</button>
					</Tooltip>
				</div>
			</div>

			{/* Content */}
			{slots.length === 0 ? (
				<div class="v2-trainees-empty">
					<Upload size={48} strokeWidth={1} />
					<p>No saved builds yet</p>
					<p class="v2-trainees-empty-hint">
						Configure an uma and click "Save Trainee" to save your first build
					</p>
				</div>
			) : viewMode === 'sections' ? (
				/* Section view */
				<div class="v2-trainees-sections">
					{/* Ungrouped builds first */}
					{ungrouped.length > 0 && renderCards(ungrouped)}

					{/* Folder sections */}
					{folders.map(folder => {
						const folderSlots = grouped.get(folder.name) || [];
						return (
							<FolderSection
								key={folder.name}
								folder={folder}
								slots={folderSlots}
								onToggle={() => handleToggleFolder(folder.name)}
								onDelete={() => handleDeleteFolder(folder.name)}
								onRename={(n) => handleRenameFolder(folder.name, n)}
							>
								{folderSlots.length === 0 ? (
									<div class="v2-folder-empty">No builds in this folder</div>
								) : renderCards(folderSlots)}
							</FolderSection>
						);
					})}
				</div>
			) : (
				/* Drill-down view - root level */
				<div class="v2-trainees-drilldown">
					{/* Folder cards */}
					{folders.length > 0 && (
						<div class="v2-folder-cards-grid">
							{folders.map(folder => (
								<FolderCard
									key={folder.name}
									folder={folder}
									count={(grouped.get(folder.name) || []).length}
									onClick={() => setDrilldownFolder(folder.name)}
									onDelete={() => handleDeleteFolder(folder.name)}
								/>
							))}
						</div>
					)}

					{/* Ungrouped builds */}
					{ungrouped.length > 0 && renderCards(ungrouped)}
				</div>
			)}

			{/* Modals */}
			<SaveTraineeModal
				isOpen={saveModalOpen}
				onClose={() => setSaveModalOpen(false)}
				onSave={handleSave}
				defaultName={getDefaultName(saveTarget)}
			/>
			<CreateFolderModal
				isOpen={folderModalOpen}
				onClose={() => setFolderModalOpen(false)}
				onCreate={handleCreateFolder}
			/>
		</div>
	);
}
