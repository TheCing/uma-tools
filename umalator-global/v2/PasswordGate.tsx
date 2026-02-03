/**
 * Password Gate
 * Temporary password-locked landing page for beta access
 */

import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';

const STORAGE_KEY = 'umalator-v2-access';

interface PasswordGateProps {
	password: string;
	children: preact.ComponentChildren;
}

function hashPassword(pwd: string): string {
	// Simple hash for client-side check (not secure, just a gate)
	let hash = 0;
	for (let i = 0; i < pwd.length; i++) {
		const char = pwd.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return hash.toString(36);
}

export function PasswordGate({ password, children }: PasswordGateProps) {
	const expectedHash = hashPassword(password);

	const [isUnlocked, setIsUnlocked] = useState(() => {
		try {
			return localStorage.getItem(STORAGE_KEY) === expectedHash;
		} catch {
			return false;
		}
	});

	const [input, setInput] = useState('');
	const [error, setError] = useState(false);
	const [shake, setShake] = useState(false);

	const handleSubmit = useCallback((e: Event) => {
		e.preventDefault();
		if (input.toLowerCase() === password.toLowerCase()) {
			try {
				localStorage.setItem(STORAGE_KEY, expectedHash);
			} catch {
				// Continue anyway
			}
			setIsUnlocked(true);
		} else {
			setError(true);
			setShake(true);
			setTimeout(() => setShake(false), 500);
		}
	}, [input, password, expectedHash]);

	const handleInputChange = useCallback((e: Event) => {
		setInput((e.target as HTMLInputElement).value);
		setError(false);
	}, []);

	if (isUnlocked) {
		return <>{children}</>;
	}

	return (
		<div class="v2-password-gate">
			<div class={`v2-password-card ${shake ? 'shake' : ''}`}>
				<div class="v2-password-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
				</div>
				<h1 class="v2-password-title">Umalator v2 Beta</h1>
				<p class="v2-password-subtitle">Enter the password to access the beta</p>

				<form onSubmit={handleSubmit} class="v2-password-form">
					<input
						type="password"
						value={input}
						onInput={handleInputChange}
						placeholder="Password"
						class={`v2-password-input ${error ? 'error' : ''}`}
						autoFocus
					/>
					<button type="submit" class="v2-password-submit">
						Enter
					</button>
				</form>

				{error && (
					<p class="v2-password-error">Incorrect password</p>
				)}
			</div>
		</div>
	);
}
