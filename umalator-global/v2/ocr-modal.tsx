/**
 * v2 OCR Modal
 * Import horse data from screenshots using Google Gemini AI
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, Fragment } from 'preact';
import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { Modal, Button, CustomSelect } from './components';
import { Upload, Camera, ArrowLeft, Check, Loader2, ExternalLink } from 'lucide-react';

import {
	extractHorseDataFromImage,
	fileToBase64,
	getStoredApiKey,
	storeApiKey,
	clearStoredApiKey,
	mapSkillNamesToIds,
	mapOutfitNameToId,
	mapCharacterNameToOutfitId,
	OCR_PROXY_URL,
	OCRHorseData
} from '../../components/GeminiOCR';

import type { UmaState } from './uma-panel';

interface OCRModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (state: UmaState) => void;
}

// Aptitude options for dropdowns
const APTITUDE_OPTIONS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map(v => ({
	value: v,
	label: v
}));

// Strategy options
const STRATEGY_OPTIONS = [
	{ value: 'Oonige', label: 'Runaway' },
	{ value: 'Nige', label: 'Front Runner' },
	{ value: 'Senkou', label: 'Pace Chaser' },
	{ value: 'Sasi', label: 'Late Surger' },
	{ value: 'Oikomi', label: 'End Closer' },
];

/**
 * Convert OCRHorseData to UmaState
 */
function ocrDataToUmaState(data: OCRHorseData): UmaState {
	// Try to match outfit first, fall back to character name if that fails
	let outfitId = mapOutfitNameToId(data.outfit);
	if (!outfitId && data.name) {
		outfitId = mapCharacterNameToOutfitId(data.name);
	}

	return {
		outfitId: outfitId || '',
		speed: data.speed || 1200,
		stamina: data.stamina || 1200,
		power: data.power || 800,
		guts: data.guts || 400,
		wisdom: data.wisdom || 400,
		strategy: (data.strategy as any) || 'Senkou',
		distanceAptitude: (data.distanceAptitude as any) || 'A',
		surfaceAptitude: (data.surfaceAptitude as any) || 'A',
		strategyAptitude: (data.strategyAptitude as any) || 'A',
		mood: 2,
		skills: mapSkillNamesToIds(data.skills || []),
		forcedSkillPositions: {},
	};
}

export function OCRModal({ isOpen, onClose, onConfirm }: OCRModalProps) {
	const [apiKey, setApiKey] = useState(getStoredApiKey() || '');
	const [saveApiKey, setSaveApiKey] = useState(!!getStoredApiKey());
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [extractedData, setExtractedData] = useState<OCRHorseData | null>(null);
	const [editableData, setEditableData] = useState<OCRHorseData | null>(null);
	const [step, setStep] = useState<'upload' | 'review'>('upload');

	const fileInputRef = useRef<HTMLInputElement>(null);
	const dropZoneRef = useRef<HTMLDivElement>(null);

	// Reset state when modal opens
	useEffect(() => {
		if (isOpen) {
			setImagePreview(null);
			setImageFile(null);
			setError(null);
			setExtractedData(null);
			setEditableData(null);
			setStep('upload');
			setLoading(false);
		}
	}, [isOpen]);

	const processFile = useCallback((file: File) => {
		if (!file.type.startsWith('image/')) {
			setError('Please select an image file');
			return;
		}

		setError(null);
		setImageFile(file);

		const reader = new FileReader();
		reader.onload = () => {
			setImagePreview(reader.result as string);
		};
		reader.readAsDataURL(file);
	}, []);

	const handleFileSelect = useCallback((e: Event) => {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			processFile(file);
		}
	}, [processFile]);

	const handleDragOver = useCallback((e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dropZoneRef.current?.classList.add('dragover');
	}, []);

	const handleDragLeave = useCallback((e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dropZoneRef.current?.classList.remove('dragover');
	}, []);

	const handleDrop = useCallback((e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dropZoneRef.current?.classList.remove('dragover');

		const file = e.dataTransfer?.files?.[0];
		if (file) {
			processFile(file);
		}
	}, [processFile]);

	// Add paste listener when modal is open
	useEffect(() => {
		if (!isOpen) return;

		function handlePaste(e: ClipboardEvent) {
			const items = e.clipboardData?.items;
			if (!items) return;

			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item.type.startsWith('image/')) {
					const file = item.getAsFile();
					if (file) {
						processFile(file);
						break;
					}
				}
			}
		}

		document.addEventListener('paste', handlePaste);
		return () => document.removeEventListener('paste', handlePaste);
	}, [isOpen, processFile]);

	const handleExtract = useCallback(async () => {
		if (!imageFile) {
			setError('Please select an image first');
			return;
		}

		if (!OCR_PROXY_URL && !apiKey.trim()) {
			setError('Please enter your Gemini API key');
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const { base64, mimeType } = await fileToBase64(imageFile);
			const result = await extractHorseDataFromImage(base64, mimeType, apiKey.trim());

			if (result.success && result.data) {
				// Save API key if checkbox is checked
				if (saveApiKey) {
					storeApiKey(apiKey.trim());
				} else {
					clearStoredApiKey();
				}

				setExtractedData(result.data);
				setEditableData(result.data);
				setStep('review');
			} else {
				setError(result.error || 'Failed to extract data from image');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'An error occurred');
		} finally {
			setLoading(false);
		}
	}, [imageFile, apiKey, saveApiKey]);

	const handleConfirm = useCallback(() => {
		if (editableData) {
			const umaState = ocrDataToUmaState(editableData);
			onConfirm(umaState);
			onClose();
		}
	}, [editableData, onConfirm, onClose]);

	const handleBack = useCallback(() => {
		setStep('upload');
		setExtractedData(null);
		setEditableData(null);
	}, []);

	const updateEditableData = useCallback((field: keyof OCRHorseData, value: any) => {
		if (editableData) {
			setEditableData({ ...editableData, [field]: value });
		}
	}, [editableData]);

	// Upload step footer
	const uploadFooter = (
		<>
			<Button variant="ghost" onClick={onClose}>Cancel</Button>
			<Button
				variant="primary"
				onClick={handleExtract}
				disabled={loading || !imageFile}
				icon={loading ? <Loader2 size={14} class="v2-ocr-spinner" /> : <Camera size={14} />}
			>
				{loading ? 'Extracting...' : 'Extract Data'}
			</Button>
		</>
	);

	// Review step footer
	const reviewFooter = (
		<>
			<Button variant="ghost" onClick={handleBack} icon={<ArrowLeft size={14} />}>
				Back
			</Button>
			<Button variant="primary" onClick={handleConfirm} icon={<Check size={14} />}>
				Confirm & Load
			</Button>
		</>
	);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Import from Screenshot (OCR)"
			footer={step === 'upload' ? uploadFooter : reviewFooter}
			size="xl"
			className="v2-ocr-modal"
		>
			{step === 'upload' ? (
				<div class="v2-ocr-upload">
					{/* API Key Section - always shown so users can fall back to their own key */}
					<div class="v2-ocr-section">
						<label class="v2-ocr-label">
							Gemini API Key
							{OCR_PROXY_URL && <span class="v2-ocr-optional"> (optional)</span>}
						</label>
						<div class="v2-ocr-api-row">
							<input
								type="password"
								class="v2-ocr-input"
								placeholder={OCR_PROXY_URL ? "Optional \u2014 uses server key by default" : "Enter your Gemini API key"}
								value={apiKey}
								onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
							/>
							<label class="v2-ocr-checkbox">
								<input
									type="checkbox"
									checked={saveApiKey}
									onChange={(e) => setSaveApiKey((e.target as HTMLInputElement).checked)}
								/>
								<span>Save key</span>
							</label>
						</div>
						<a
							class="v2-ocr-api-link"
							href="https://aistudio.google.com/app/apikey"
							target="_blank"
							rel="noopener noreferrer"
						>
							<ExternalLink size={12} />
							Get a free API key from Google AI Studio
						</a>
					</div>

					{/* Image Upload Section */}
					<div class="v2-ocr-section">
						<label class="v2-ocr-label">Screenshot</label>
						<div
							ref={dropZoneRef}
							class={`v2-ocr-dropzone ${imagePreview ? 'has-image' : ''}`}
							onClick={() => fileInputRef.current?.click()}
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
							onDrop={handleDrop}
						>
							{imagePreview ? (
								<img src={imagePreview} alt="Preview" class="v2-ocr-preview" />
							) : (
								<div class="v2-ocr-dropzone-content">
									<Upload size={32} class="v2-ocr-dropzone-icon" />
									<span>Click to select, drag & drop, or paste an image</span>
								</div>
							)}
						</div>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={handleFileSelect}
						/>
					</div>

					{/* Error Message */}
					{error && <div class="v2-ocr-error">{error}</div>}
				</div>
			) : (
				<div class="v2-ocr-review">
					{/* Side by side layout */}
					<div class="v2-ocr-review-layout">
						{/* Image Preview */}
						<div class="v2-ocr-review-image-section">
							<label class="v2-ocr-label">Screenshot</label>
							{imagePreview && (
								<img src={imagePreview} alt="Screenshot" class="v2-ocr-review-image" />
							)}
						</div>

						{/* Extracted Data */}
						<div class="v2-ocr-review-data-section">
							<label class="v2-ocr-label">Extracted Data</label>
							<div class="v2-ocr-review-grid">
								<div class="v2-ocr-review-item">
									<span class="v2-ocr-review-key">Name:</span>
									<span class="v2-ocr-review-value">{extractedData?.name || '-'}</span>
								</div>
								<div class="v2-ocr-review-item">
									<span class="v2-ocr-review-key">Outfit:</span>
									<span class="v2-ocr-review-value">{extractedData?.outfit || '-'}</span>
								</div>
								<div class="v2-ocr-review-item v2-ocr-review-stats">
									<span class="v2-ocr-review-key">Stats:</span>
									<span class="v2-ocr-review-value">
										SPD {extractedData?.speed} / STA {extractedData?.stamina} / POW {extractedData?.power} / GUT {extractedData?.guts} / WIS {extractedData?.wisdom}
									</span>
								</div>

								{/* Editable fields */}
								<div class="v2-ocr-review-item v2-ocr-review-editable">
									<span class="v2-ocr-review-key">Surface:</span>
									<CustomSelect
										value={editableData?.surfaceAptitude || 'A'}
										onChange={(v) => updateEditableData('surfaceAptitude', v)}
										options={APTITUDE_OPTIONS}
										className="v2-ocr-select-small"
									/>
								</div>
								<div class="v2-ocr-review-item v2-ocr-review-editable">
									<span class="v2-ocr-review-key">Distance:</span>
									<CustomSelect
										value={editableData?.distanceAptitude || 'A'}
										onChange={(v) => updateEditableData('distanceAptitude', v)}
										options={APTITUDE_OPTIONS}
										className="v2-ocr-select-small"
									/>
								</div>
								<div class="v2-ocr-review-item v2-ocr-review-editable">
									<span class="v2-ocr-review-key">Strategy:</span>
									<CustomSelect
										value={editableData?.strategy || 'Senkou'}
										onChange={(v) => updateEditableData('strategy', v)}
										options={STRATEGY_OPTIONS}
										className="v2-ocr-select-strategy"
									/>
								</div>
								<div class="v2-ocr-review-item v2-ocr-review-editable">
									<span class="v2-ocr-review-key">Style Apt:</span>
									<CustomSelect
										value={editableData?.strategyAptitude || 'A'}
										onChange={(v) => updateEditableData('strategyAptitude', v)}
										options={APTITUDE_OPTIONS}
										className="v2-ocr-select-small"
									/>
								</div>

								<div class="v2-ocr-review-item v2-ocr-review-skills">
									<span class="v2-ocr-review-key">Skills ({extractedData?.skills?.length || 0}):</span>
									<div class="v2-ocr-skill-list">
										{extractedData?.skills?.map((skill, i) => (
											<span key={i} class="v2-ocr-skill-tag">{skill}</span>
										)) || '-'}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</Modal>
	);
}
