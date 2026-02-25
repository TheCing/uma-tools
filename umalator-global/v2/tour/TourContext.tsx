/**
 * Tour Context
 * State management for the onboarding tour
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, createContext } from 'preact';
import { useState, useCallback, useContext, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { TourState, TourContextValue, TourStep } from './types';
import { TOUR_STEPS } from './steps';
import { loadPreferences, savePreferences } from '../storage';

const TourContext = createContext<TourContextValue | null>(null);

interface TourProviderProps {
	children: ComponentChildren;
	autoStart?: boolean;
}

export function TourProvider({ children, autoStart = true }: TourProviderProps) {
	const [state, setState] = useState<TourState>({
		isActive: false,
		currentStepIndex: 0,
		steps: TOUR_STEPS,
	});

	// Check if tour should auto-start on first visit
	useEffect(() => {
		if (autoStart) {
			const prefs = loadPreferences();
			// Check if this is first visit (tourCompleted is false or undefined)
			if (!prefs.tourCompleted) {
				// Delay to allow initial render
				const timer = setTimeout(() => startTour(), 1500);
				return () => clearTimeout(timer);
			}
		}
	}, [autoStart]);

	const startTour = useCallback(() => {
		setState(s => ({ ...s, isActive: true, currentStepIndex: 0 }));
	}, []);

	const endTour = useCallback(() => {
		setState(s => ({ ...s, isActive: false }));
		savePreferences({ tourCompleted: true });
	}, []);

	const skipTour = useCallback(() => {
		endTour();
	}, [endTour]);

	const nextStep = useCallback(() => {
		setState(s => {
			if (s.currentStepIndex >= s.steps.length - 1) {
				// Tour complete
				savePreferences({ tourCompleted: true });
				return { ...s, isActive: false };
			}
			return { ...s, currentStepIndex: s.currentStepIndex + 1 };
		});
	}, []);

	const prevStep = useCallback(() => {
		setState(s => ({
			...s,
			currentStepIndex: Math.max(0, s.currentStepIndex - 1),
		}));
	}, []);

	const goToStep = useCallback((index: number) => {
		setState(s => ({
			...s,
			currentStepIndex: Math.max(0, Math.min(index, s.steps.length - 1)),
		}));
	}, []);

	const value: TourContextValue = {
		state,
		startTour,
		endTour,
		nextStep,
		prevStep,
		goToStep,
		skipTour,
	};

	return (
		<TourContext.Provider value={value}>
			{children}
		</TourContext.Provider>
	);
}

export function useTour(): TourContextValue {
	const ctx = useContext(TourContext);
	if (!ctx) {
		throw new Error('useTour must be used within TourProvider');
	}
	return ctx;
}
