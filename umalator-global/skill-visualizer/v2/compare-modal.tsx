/**
 * Compare Modal — renders a single skill's data from BOTH the Global and JP
 * databases side-by-side. Used by the v2 skill visualizer to surface
 * activation-condition and proc-effect differences between databases.
 *
 * Reuses the SkillDetailsBody render extracted from SkillChip so the modal
 * stays in sync with the inline card view.
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h } from 'preact';
import { Modal } from '../../v2/components';
import { SkillDetailsBody, type SkillDataSource } from '../../v2/skills';

interface CompareModalProps {
	skillId: string | null;
	globalSource: SkillDataSource;
	jpSource: SkillDataSource | null;   // null while JP data is still loading
	jpLoadError?: string | null;
	courseDistance?: number;
	onClose: () => void;
}

export function CompareModal({
	skillId, globalSource, jpSource, jpLoadError, courseDistance, onClose,
}: CompareModalProps) {
	if (!skillId) return null;

	const globalSkill = globalSource.skills[skillId];
	const jpSkill = jpSource?.skills[skillId];
	const globalName = nameFor(globalSource, skillId);
	const jpName = jpSource ? nameFor(jpSource, skillId) : null;

	// Title prefers the version that has the skill — falls back to either.
	const titleName = globalName ?? jpName ?? `Skill ${skillId}`;

	return (
		<Modal
			isOpen
			onClose={onClose}
			title={`Compare — ${titleName}`}
			size="xl"
			className="sv2-compare-modal"
		>
			<div class="sv2-compare-columns">
				<CompareColumn
					label="Global"
					accent="global"
					skillId={skillId}
					skill={globalSkill}
					hasSource={true}
					sourceLoading={false}
					sourceError={null}
					courseDistance={courseDistance}
				/>
				<div class="sv2-compare-divider" aria-hidden="true" />
				<CompareColumn
					label="JP"
					accent="jp"
					skillId={skillId}
					skill={jpSkill}
					hasSource={jpSource !== null}
					sourceLoading={jpSource === null && !jpLoadError}
					sourceError={jpLoadError ?? null}
					courseDistance={courseDistance}
				/>
			</div>
		</Modal>
	);
}

interface CompareColumnProps {
	label: string;
	accent: 'global' | 'jp';
	skillId: string;
	skill: any | undefined;
	hasSource: boolean;
	sourceLoading: boolean;
	sourceError: string | null;
	courseDistance?: number;
}

function CompareColumn({
	label, accent, skillId, skill, hasSource, sourceLoading, sourceError, courseDistance,
}: CompareColumnProps) {
	return (
		<section class={`sv2-compare-col sv2-compare-col-${accent}`}>
			<header class="sv2-compare-col-header">
				<span class={`sv2-compare-col-badge sv2-compare-col-badge-${accent}`}>{label}</span>
			</header>

			{sourceLoading ? (
				<div class="sv2-compare-placeholder">Loading {label} data…</div>
			) : sourceError ? (
				<div class="sv2-compare-placeholder sv2-compare-placeholder-error">
					Couldn't load {label} data:<br/>
					<code>{sourceError}</code>
				</div>
			) : !hasSource ? (
				<div class="sv2-compare-placeholder">
					{label} database not available.
				</div>
			) : !skill ? (
				<div class="sv2-compare-placeholder">
					<strong>Not in {label} database.</strong><br/>
					<small>This skill is only present in the other version.</small>
				</div>
			) : (
				<div class="sv2-compare-col-body">
					<SkillDetailsBody
						skillId={skillId}
						skill={skill}
						courseDistance={courseDistance}
					/>
				</div>
			)}
		</section>
	);
}

function nameFor(source: SkillDataSource, skillId: string): string | null {
	const names = source.skillnames[skillId];
	if (!names || names.length === 0) return null;
	return names[names.length - 1] || names[0];
}
