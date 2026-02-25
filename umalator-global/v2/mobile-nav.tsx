/**
 * Mobile Bottom Navigation
 * Shows on screens < 768px, replaces side tabs
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { MapPin, Users, Clock, Settings, Play } from 'lucide-react';

export type MobileView = 'track' | 'uma' | 'timeline' | 'settings';

interface MobileNavProps {
	activeView: MobileView;
	onViewChange: (view: MobileView) => void;
	onRun: () => void;
	isRunning?: boolean;
	hasResults?: boolean;
}

export function MobileNav({ activeView, onViewChange, onRun, isRunning, hasResults }: MobileNavProps) {
	return (
		<nav class="v2-mobile-nav">
			<button
				type="button"
				class={`v2-mobile-nav-item ${activeView === 'track' ? 'active' : ''}`}
				onClick={() => onViewChange('track')}
			>
				<MapPin size={20} />
				<span>Track</span>
			</button>
			<button
				type="button"
				class={`v2-mobile-nav-item ${activeView === 'uma' ? 'active' : ''}`}
				onClick={() => onViewChange('uma')}
			>
				<Users size={20} />
				<span>Uma</span>
			</button>
			<button
				type="button"
				class="v2-mobile-nav-run"
				onClick={onRun}
				disabled={isRunning}
			>
				<Play size={24} />
				<span>{isRunning ? 'Running' : 'RUN'}</span>
			</button>
			<button
				type="button"
				class={`v2-mobile-nav-item ${activeView === 'timeline' ? 'active' : ''} ${hasResults ? '' : 'disabled'}`}
				onClick={() => hasResults && onViewChange('timeline')}
				disabled={!hasResults}
			>
				<Clock size={20} />
				<span>Timeline</span>
			</button>
			<button
				type="button"
				class={`v2-mobile-nav-item ${activeView === 'settings' ? 'active' : ''}`}
				onClick={() => onViewChange('settings')}
			>
				<Settings size={20} />
				<span>More</span>
			</button>
		</nav>
	);
}
