/**
 * Feedback Drawer
 * Right-side drawer for submitting user feedback via Discord webhook
 */

import { h } from 'preact';
import { useState, useCallback, useEffect } from 'preact/hooks';
import { X, Send, MessageSquare, CheckCircle, AlertCircle } from 'lucide-react';
import { Button, CustomSelect, type SelectOption } from './components';

interface FeedbackDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	webhookUrl?: string;
}

type FeedbackCategory = 'bug' | 'feature' | 'question' | 'other';
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

// Category metadata for Discord embeds
const CATEGORY_META: Record<FeedbackCategory, { label: string; emoji: string }> = {
	bug: { label: 'Bug Report', emoji: ':bug:' },
	feature: { label: 'Feature Request', emoji: ':sparkles:' },
	question: { label: 'Question', emoji: ':question:' },
	other: { label: 'Other', emoji: ':speech_balloon:' },
};

// Options for CustomSelect
const CATEGORY_OPTIONS: SelectOption[] = [
	{ value: 'bug', label: 'Bug Report' },
	{ value: 'feature', label: 'Feature Request' },
	{ value: 'question', label: 'Question' },
	{ value: 'other', label: 'Other' },
];

// Spam prevention
const COOLDOWN_MS = 60_000; // 60 seconds between submissions
const COOLDOWN_KEY = 'umalator_feedback_cooldown';

function getCooldownRemaining(): number {
	const lastSubmit = localStorage.getItem(COOLDOWN_KEY);
	if (!lastSubmit) return 0;
	const elapsed = Date.now() - parseInt(lastSubmit, 10);
	return Math.max(0, COOLDOWN_MS - elapsed);
}

function setCooldown(): void {
	localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
}

export function FeedbackDrawer({ isOpen, onClose, webhookUrl }: FeedbackDrawerProps) {
	const [category, setCategory] = useState<FeedbackCategory>('bug');
	const [message, setMessage] = useState('');
	const [contact, setContact] = useState('');
	const [status, setStatus] = useState<SubmitStatus>('idle');
	const [errorMessage, setErrorMessage] = useState('');

	// Spam prevention
	const [honeypot, setHoneypot] = useState(''); // Hidden field - bots fill this
	const [cooldownRemaining, setCooldownRemaining] = useState(getCooldownRemaining);

	// Update cooldown timer
	useEffect(() => {
		if (cooldownRemaining <= 0) return;
		const timer = setInterval(() => {
			setCooldownRemaining(getCooldownRemaining());
		}, 1000);
		return () => clearInterval(timer);
	}, [cooldownRemaining > 0]);

	const resetForm = useCallback(() => {
		setCategory('bug');
		setMessage('');
		setContact('');
		setHoneypot('');
		setStatus('idle');
		setErrorMessage('');
	}, []);

	const handleClose = useCallback(() => {
		onClose();
		// Reset form after close animation
		setTimeout(resetForm, 300);
	}, [onClose, resetForm]);

	const handleSubmit = useCallback(async (e: Event) => {
		e.preventDefault();

		// Honeypot check - bots fill hidden fields
		if (honeypot) {
			// Silently "succeed" to not tip off bots
			setStatus('success');
			setTimeout(handleClose, 2000);
			return;
		}

		// Cooldown check
		const remaining = getCooldownRemaining();
		if (remaining > 0) {
			setCooldownRemaining(remaining);
			setErrorMessage(`Please wait ${Math.ceil(remaining / 1000)}s before sending again`);
			return;
		}

		if (!message.trim()) {
			setErrorMessage('Please enter a message');
			return;
		}

		if (!webhookUrl) {
			setErrorMessage('Webhook URL not configured');
			return;
		}

		setStatus('submitting');
		setErrorMessage('');

		const categoryInfo = CATEGORY_META[category];
		const embed = {
			title: `${categoryInfo.emoji} ${categoryInfo.label}`,
			description: message.trim(),
			color: category === 'bug' ? 0xef4444 : category === 'feature' ? 0x22c55e : category === 'question' ? 0x3b82f6 : 0x6b7280,
			fields: contact.trim() ? [{ name: 'Contact', value: contact.trim(), inline: true }] : [],
			footer: { text: 'Umalator v2 Feedback' },
			timestamp: new Date().toISOString(),
		};

		try {
			const response = await fetch(webhookUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ embeds: [embed] }),
			});

			if (response.ok || response.status === 204) {
				setStatus('success');
				setCooldown(); // Start cooldown timer
				setCooldownRemaining(COOLDOWN_MS);
				// Auto-close after success
				setTimeout(() => {
					handleClose();
				}, 2000);
			} else {
				throw new Error(`Failed to send: ${response.status}`);
			}
		} catch (err) {
			setStatus('error');
			setErrorMessage(err instanceof Error ? err.message : 'Failed to send feedback');
		}
	}, [message, contact, category, webhookUrl, honeypot, handleClose]);

	return (
		<>
			{/* Toggle Tab - Bottom Right */}
			<button
				type="button"
				class={`v2-feedback-toggle ${isOpen ? 'open' : ''}`}
				onClick={() => isOpen ? onClose() : null}
				style={{ pointerEvents: isOpen ? 'none' : 'auto' }}
				aria-label="Send feedback"
			>
				<MessageSquare size={18} />
				<span>Feedback</span>
			</button>

			{/* Drawer Panel */}
			<aside class={`v2-feedback-drawer ${isOpen ? 'open' : ''}`}>
				<div class="v2-feedback-header">
					<h2 class="v2-feedback-title">
						<MessageSquare size={18} />
						Send Feedback
					</h2>
					<button type="button" class="v2-feedback-close" onClick={handleClose}>
						<X size={18} />
					</button>
				</div>

				{status === 'success' ? (
					<div class="v2-feedback-success">
						<CheckCircle size={48} />
						<h3>Thanks for your feedback!</h3>
						<p>We appreciate you taking the time to help improve Umalator.</p>
					</div>
				) : (
					<form class="v2-feedback-form" onSubmit={handleSubmit}>
						{/* Category Select */}
						<div class="v2-feedback-field">
							<label class="v2-feedback-label">Category</label>
							<CustomSelect
								value={category}
								onChange={(val) => setCategory(val as FeedbackCategory)}
								options={CATEGORY_OPTIONS}
								disabled={status === 'submitting'}
							/>
						</div>

						{/* Message */}
						<div class="v2-feedback-field">
							<label class="v2-feedback-label">Message</label>
							<textarea
								class="v2-feedback-textarea"
								value={message}
								onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
								placeholder="Describe your feedback, bug, or question..."
								rows={6}
								disabled={status === 'submitting'}
							/>
						</div>

						{/* Contact (Optional) */}
						<div class="v2-feedback-field">
							<label class="v2-feedback-label">
								Contact <span class="v2-feedback-optional">(optional)</span>
							</label>
							<input
								type="text"
								class="v2-feedback-input"
								value={contact}
								onInput={(e) => setContact((e.target as HTMLInputElement).value)}
								placeholder="Discord username or email for follow-up"
								disabled={status === 'submitting'}
							/>
						</div>

						{/* Honeypot - hidden from humans, bots fill this */}
						<div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
							<label>
								Leave this empty
								<input
									type="text"
									name="website"
									value={honeypot}
									onInput={(e) => setHoneypot((e.target as HTMLInputElement).value)}
									tabIndex={-1}
									autoComplete="off"
								/>
							</label>
						</div>

						{/* Error Message */}
						{errorMessage && (
							<div class="v2-feedback-error">
								<AlertCircle size={14} />
								{errorMessage}
							</div>
						)}

						{/* Submit Button */}
						<Button
							type="submit"
							variant="primary"
							disabled={status === 'submitting' || !message.trim()}
							class="v2-feedback-submit"
						>
							{status === 'submitting' ? (
								<>Sending...</>
							) : (
								<>
									<Send size={14} />
									Send Feedback
								</>
							)}
						</Button>
					</form>
				)}
			</aside>
		</>
	);
}

/**
 * Toggle button component for when drawer is closed
 * Can be used externally to trigger the drawer
 */
export function FeedbackToggle({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			class="v2-feedback-toggle"
			onClick={onClick}
			aria-label="Send feedback"
		>
			<MessageSquare size={18} />
			<span>Feedback</span>
		</button>
	);
}
