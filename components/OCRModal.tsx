import { h, Fragment } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import {
	extractHorseDataFromImage,
	fileToBase64,
	getStoredApiKey,
	storeApiKey,
	clearStoredApiKey,
	OCRHorseData
} from './GeminiOCR';

import './OCRModal.css';

interface OCRModalProps {
	open: boolean;
	onClose: () => void;
	onConfirm: (data: OCRHorseData) => void;
}

export function OCRModal({ open, onClose, onConfirm }: OCRModalProps) {
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
		if (open) {
			setImagePreview(null);
			setImageFile(null);
			setError(null);
			setExtractedData(null);
			setEditableData(null);
			setStep('upload');
			setLoading(false);
		}
	}, [open]);

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			processFile(file);
		}
	}

	function processFile(file: File) {
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
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dropZoneRef.current?.classList.add('dragover');
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dropZoneRef.current?.classList.remove('dragover');
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dropZoneRef.current?.classList.remove('dragover');

		const file = e.dataTransfer?.files?.[0];
		if (file) {
			processFile(file);
		}
	}

	function handlePaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;

		for (const item of items) {
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) {
					processFile(file);
					break;
				}
			}
		}
	}

	// Add paste listener when modal is open
	useEffect(() => {
		if (open) {
			document.addEventListener('paste', handlePaste);
			return () => document.removeEventListener('paste', handlePaste);
		}
	}, [open]);

	async function handleExtract() {
		if (!imageFile) {
			setError('Please select an image first');
			return;
		}

		if (!apiKey.trim()) {
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

				// Log extracted data for debugging
				console.log('OCR Extracted Data:', result.data);

				setExtractedData(result.data);
				setEditableData(result.data); // Initialize editable copy
				setStep('review');
			} else {
				setError(result.error || 'Failed to extract data from image');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'An error occurred');
		} finally {
			setLoading(false);
		}
	}

	function handleConfirm() {
		if (editableData) {
			onConfirm(editableData);
			onClose();
		}
	}

	function handleBack() {
		setStep('upload');
		setExtractedData(null);
		setEditableData(null);
	}

	function updateEditableData(field: keyof OCRHorseData, value: any) {
		if (editableData) {
			setEditableData({ ...editableData, [field]: value });
		}
	}

	if (!open) return null;

	return (
		<div className="ocrModalOverlay" onClick={onClose}>
			<div className="ocrModal" onClick={e => e.stopPropagation()}>
				<div className="ocrModalHeader">
					<span>Import from Screenshot (OCR)</span>
					<button className="ocrModalClose" onClick={onClose}>&times;</button>
				</div>

				<div className="ocrModalContent">
					{step === 'upload' ? (
						<>
							{/* API Key Section */}
							<div className="ocrSection">
								<label className="ocrLabel">Gemini API Key</label>
								<div className="ocrApiKeyRow">
									<input
										type="password"
										className="ocrInput"
										placeholder="Enter your Gemini API key"
										value={apiKey}
										onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
									/>
									<label className="ocrCheckboxLabel">
										<input
											type="checkbox"
											checked={saveApiKey}
											onChange={(e) => setSaveApiKey((e.target as HTMLInputElement).checked)}
										/>
										Save key
									</label>
								</div>
								<a
									className="ocrApiLink"
									href="https://aistudio.google.com/app/apikey"
									target="_blank"
									rel="noopener noreferrer"
								>
									Get a free API key from Google AI Studio
								</a>
							</div>

							{/* Image Upload Section */}
							<div className="ocrSection">
								<label className="ocrLabel">Screenshot</label>
								<div
									ref={dropZoneRef}
									className={`ocrDropZone ${imagePreview ? 'hasImage' : ''}`}
									onClick={() => fileInputRef.current?.click()}
									onDragOver={handleDragOver}
									onDragLeave={handleDragLeave}
									onDrop={handleDrop}
								>
									{imagePreview ? (
										<img src={imagePreview} alt="Preview" className="ocrPreviewImage" />
									) : (
										<div className="ocrDropZoneText">
											<span className="ocrDropIcon">+</span>
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
							{error && <div className="ocrError">{error}</div>}

							{/* Action Buttons */}
							<div className="ocrActions">
								<button className="ocrButtonCancel" onClick={onClose}>Cancel</button>
								<button
									className="ocrButtonExtract"
									onClick={handleExtract}
									disabled={loading || !imageFile}
								>
									{loading ? 'Extracting...' : 'Extract Data'}
								</button>
							</div>
						</>
					) : (
						<>
							{/* Side by side: Image and Extracted Data */}
							<div className="ocrReviewLayout">
								{/* Image Preview */}
								<div className="ocrReviewImageSection">
									<label className="ocrLabel">Screenshot</label>
									{imagePreview && (
										<img src={imagePreview} alt="Screenshot" className="ocrReviewImage" />
									)}
								</div>

								{/* Extracted Data */}
								<div className="ocrSection ocrReviewDataSection">
									<label className="ocrLabel">Extracted Data</label>
									<div className="ocrReviewGrid">
									<div className="ocrReviewItem">
										<span className="ocrReviewLabel">Name:</span>
										<span className="ocrReviewValue">{extractedData?.name || '-'}</span>
									</div>
									<div className="ocrReviewItem">
										<span className="ocrReviewLabel">Outfit:</span>
										<span className="ocrReviewValue">{extractedData?.outfit || '-'}</span>
									</div>
									<div className="ocrReviewItem ocrReviewStats">
										<span className="ocrReviewLabel">Stats:</span>
										<span className="ocrReviewValue">
											SPD {extractedData?.speed} / STA {extractedData?.stamina} / POW {extractedData?.power} / GUT {extractedData?.guts} / WIS {extractedData?.wisdom}
										</span>
									</div>
									<div className="ocrReviewItem ocrReviewAptitude">
										<span className="ocrReviewLabel">Surface:</span>
										<select
											className="ocrAptitudeSelect"
											value={editableData?.surfaceAptitude || 'A'}
											onChange={(e) => updateEditableData('surfaceAptitude', (e.target as HTMLSelectElement).value)}
										>
											<option value="S">S</option>
											<option value="A">A</option>
											<option value="B">B</option>
											<option value="C">C</option>
											<option value="D">D</option>
											<option value="E">E</option>
											<option value="F">F</option>
											<option value="G">G</option>
										</select>
									</div>
									<div className="ocrReviewItem ocrReviewAptitude">
										<span className="ocrReviewLabel">Distance:</span>
										<select
											className="ocrAptitudeSelect"
											value={editableData?.distanceAptitude || 'A'}
											onChange={(e) => updateEditableData('distanceAptitude', (e.target as HTMLSelectElement).value)}
										>
											<option value="S">S</option>
											<option value="A">A</option>
											<option value="B">B</option>
											<option value="C">C</option>
											<option value="D">D</option>
											<option value="E">E</option>
											<option value="F">F</option>
											<option value="G">G</option>
										</select>
									</div>
									<div className="ocrReviewItem ocrReviewStrategyContainer">
										<div className="ocrReviewStrategyRow">
											<span className="ocrReviewLabel">Strategy:</span>
											<select
												className="ocrStrategySelect"
												value={editableData?.strategy || 'Nige'}
												onChange={(e) => updateEditableData('strategy', (e.target as HTMLSelectElement).value)}
											>
												<option value="Oonige">Runaway</option>
												<option value="Nige">Front Runner</option>
												<option value="Senkou">Pace Chaser</option>
												<option value="Sasi">Late Surger</option>
												<option value="Oikomi">End Closer</option>
											</select>
										</div>
										<div className="ocrReviewStrategyRow">
											<span className="ocrReviewLabel">Style Aptitude:</span>
											<select
												className="ocrAptitudeSelect"
												value={editableData?.strategyAptitude || 'A'}
												onChange={(e) => updateEditableData('strategyAptitude', (e.target as HTMLSelectElement).value)}
											>
												<option value="S">S</option>
												<option value="A">A</option>
												<option value="B">B</option>
												<option value="C">C</option>
												<option value="D">D</option>
												<option value="E">E</option>
												<option value="F">F</option>
												<option value="G">G</option>
											</select>
										</div>
									</div>
									<div className="ocrReviewItem ocrReviewSkills">
										<span className="ocrReviewLabel">Skills ({extractedData?.skills?.length || 0}):</span>
										<div className="ocrSkillsList">
											{extractedData?.skills?.map((skill, i) => (
												<span key={i} className="ocrSkillTag">{skill}</span>
											)) || '-'}
										</div>
									</div>
									</div>
								</div>
							</div>

							{/* Action Buttons */}
							<div className="ocrActions">
								<button className="ocrButtonBack" onClick={handleBack}>Back</button>
								<button className="ocrButtonConfirm" onClick={handleConfirm}>
									Confirm & Load
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
