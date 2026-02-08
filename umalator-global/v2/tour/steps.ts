/**
 * Tour Steps
 * Configuration for each step in the onboarding tour
 */

import type { TourStep } from './types';

export const TOUR_STEPS: TourStep[] = [
	{
		id: 'welcome',
		targetSelector: '.v2-header',
		title: 'Welcome to Umalator!',
		content: 'This simulator helps you compare Uma builds and analyze race performance. Let\'s take a quick tour of the key features.',
		position: 'bottom',
		spotlightPadding: 0,
	},
	{
		id: 'track-select',
		targetSelector: '.v2-header-left',
		title: 'Track & Course Selection',
		content: 'Choose the race track and course distance here. Use the CM presets to quickly load Champions Meeting event settings with the correct track, conditions, and season.',
		position: 'bottom',
	},
	{
		id: 'conditions',
		targetSelector: '.v2-conditions',
		title: 'Race Conditions',
		content: 'Set the ground condition, weather, season, and time of day. These affect skill activations and race performance.',
		position: 'bottom',
	},
	{
		id: 'run-button',
		targetSelector: '.v2-run-btn',
		title: 'Run Simulation',
		content: 'Click RUN to simulate the race! The simulator runs multiple samples to give you statistical results.',
		position: 'bottom',
		spotlightPadding: 12,
	},
	{
		id: 'uma-drawer',
		targetSelector: '.v2-uma-toggle',
		title: 'Uma Configuration',
		content: 'Click here to open the Uma panel where you configure your horse\'s stats, aptitudes, strategy, and skills.',
		position: 'right',
		beforeShow: async () => {
			// Ensure drawer is closed for this step
			const drawer = document.querySelector('.v2-uma-drawer');
			if (drawer?.classList.contains('open')) {
				const toggle = document.querySelector('.v2-uma-toggle') as HTMLElement;
				toggle?.click();
				await new Promise(r => setTimeout(r, 400));
			}
		},
	},
	{
		id: 'uma-panel-open',
		targetSelector: '.v2-drawer-content',
		title: 'Configure Your Uma',
		content: 'Here you can set stats (Speed, Stamina, Power, Guts, Wisdom), aptitudes, running strategy, and add skills. Click the character portrait to select an Uma.',
		position: 'right',
		beforeShow: async () => {
			const drawer = document.querySelector('.v2-uma-drawer');
			if (!drawer?.classList.contains('open')) {
				const toggle = document.querySelector('.v2-uma-toggle') as HTMLElement;
				toggle?.click();
				await new Promise(r => setTimeout(r, 400));
			}
		},
		spotlightPadding: 0,
	},
	{
		id: 'track-visualization',
		targetSelector: '.v2-track-container',
		title: 'Track Visualization',
		content: 'The race track shows course features (corners, slopes) and skill activation regions. Hover to see velocity and HP data after running a simulation.',
		position: 'top',
		beforeShow: async () => {
			// Close uma drawer if open
			const drawer = document.querySelector('.v2-uma-drawer');
			if (drawer?.classList.contains('open')) {
				const toggle = document.querySelector('.v2-uma-toggle') as HTMLElement;
				toggle?.click();
				await new Promise(r => setTimeout(r, 400));
			}
		},
	},
	// {
	// 	id: 'racetrack-cow',
	// 	targetSelector: '.racetrackCow',
	// 	title: 'Meet the Cow!',
	// 	content: 'This friendly cow wanders the track. Click to change direction, double-click to hide. Walk with the cow to earn MooCoins!',
	// 	position: 'top',
	// 	spotlightPadding: 12,
	// 	trackMovement: true,
	// },
];
