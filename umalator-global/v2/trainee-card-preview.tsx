/**
 * Presentational uma card (portrait + name + 5-stat preview), shared by the
 * Saved-umas tab (TraineeCard) and the multi-file import picker. Read-only — no
 * memo/folder/delete/load actions; the caller wraps those around it.
 */
import { h, ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import type { UmaState } from './uma-panel';
import umas from '../umas.json';
import icons from '../../icons.json';

const randomMobIcon = `/uma-tools/icons/mob/trained_mob_chr_icon_${8000 + Math.floor(Math.random() * 624)}_000001_01.png`;

/** Character name from an outfit id (e.g. "El Condor Pasa"), or the fallback. */
export function umaDisplayName(outfitId: string | undefined, fallback: string): string {
	if (outfitId) {
		const uma = (umas as any)[outfitId.slice(0, 4)];
		if (uma?.name?.[1]) return uma.name[1];
	}
	return fallback;
}

interface TraineeCardPreviewProps {
	data: Pick<UmaState, 'outfitId' | 'speed' | 'stamina' | 'power' | 'guts' | 'wisdom'>;
	/** Displayed name (slot name in the tab; character/file name in the picker). */
	name: string;
	/** Optional content rendered between the name and the stat preview (e.g. the memo editor). */
	children?: ComponentChildren;
}

export function TraineeCardPreview({ data, name, children }: TraineeCardPreviewProps) {
	const portraitIcon = useMemo(() => {
		if (!data.outfitId) return randomMobIcon;
		return (icons as Record<string, string>)[data.outfitId] || randomMobIcon;
	}, [data.outfitId]);

	const { speed, stamina, power, guts, wisdom } = data;

	return (
		<div class="v2-trainee-card-content">
			<img src={portraitIcon} alt={name} class="v2-trainee-portrait" loading="lazy" />
			<div class="v2-trainee-info">
				<div class="v2-trainee-name" title={name}>{name}</div>
				{children}
				<div class="v2-trainee-stats-preview">
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_00.png" alt="SPD" class="v2-trainee-stat-icon" />
						{speed}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_01.png" alt="STA" class="v2-trainee-stat-icon" />
						{stamina}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_02.png" alt="POW" class="v2-trainee-stat-icon" />
						{power}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_03.png" alt="GUT" class="v2-trainee-stat-icon" />
						{guts}
					</span>
					<span class="v2-trainee-stat">
						<img src="/uma-tools/icons/status_04.png" alt="WIS" class="v2-trainee-stat-icon" />
						{wisdom}
					</span>
				</div>
			</div>
		</div>
	);
}
