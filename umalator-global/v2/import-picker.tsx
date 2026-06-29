/**
 * Modal that shows uploaded import candidates as trainee-style cards and lets the
 * user pick one to load. Ephemeral — nothing is persisted.
 */
import { h } from 'preact';
import { Modal } from './components';
import { TraineeCardPreview, umaDisplayName } from './trainee-card-preview';
import type { ImportCandidate } from './storage';
import type { UmaState } from './uma-panel';

interface ImportPickerModalProps {
	candidates: ImportCandidate[];
	onPick: (data: UmaState) => void;
	onClose: () => void;
}

export function ImportPickerModal({ candidates, onPick, onClose }: ImportPickerModalProps) {
	return (
		<Modal isOpen={true} onClose={onClose} title="Choose a uma to import">
			<div class="v2-import-picker-grid">
				{candidates.map((c, i) => (
					<button
						key={`${c.name}-${i}`}
						type="button"
						class="v2-import-picker-card"
						onClick={() => onPick(c.data)}
						title={c.name}
					>
						<TraineeCardPreview data={c.data} name={umaDisplayName(c.data.outfitId, c.name)} />
					</button>
				))}
			</div>
		</Modal>
	);
}
