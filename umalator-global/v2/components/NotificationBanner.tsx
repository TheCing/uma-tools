import { h, ComponentChildren } from 'preact';

interface NotificationBannerProps {
	children: ComponentChildren;
	onDismiss: () => void;
}

export function NotificationBanner({ children, onDismiss }: NotificationBannerProps) {
	return (
		<div class="v2-notification">
			<p>{children}</p>
			<button class="v2-notification-close" onClick={onDismiss}>
				✕
			</button>
		</div>
	);
}
