/**
 * Tour Types
 * Type definitions for the onboarding tour system
 */

export interface TourStep {
	id: string;
	targetSelector: string;
	title: string;
	content: string;
	position: 'top' | 'bottom' | 'left' | 'right' | 'auto';
	spotlightPadding?: number;
	beforeShow?: () => void | Promise<void>;
	afterHide?: () => void;
	allowInteraction?: boolean;
	highlightType?: 'rect' | 'circle';
	trackMovement?: boolean; // Continuously track moving elements
}

export interface TourState {
	isActive: boolean;
	currentStepIndex: number;
	steps: TourStep[];
}

export interface TourContextValue {
	state: TourState;
	startTour: () => void;
	endTour: () => void;
	nextStep: () => void;
	prevStep: () => void;
	goToStep: (index: number) => void;
	skipTour: () => void;
}
