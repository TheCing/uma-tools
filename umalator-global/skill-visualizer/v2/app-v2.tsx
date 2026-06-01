/**
 * Skill Visualizer v2
 * Modern UI for visualizing skill activation regions on race tracks
 *
 * Copyright (c) 2026 TheCing (https://github.com/TheCing/uma-tools)
 * Licensed under GPL-3.0-or-later
 */

import { h, render } from 'preact';
import { useState, useMemo, useCallback, useEffect } from 'preact/hooks';
import { IntlProvider, Text } from 'preact-i18n';
import { Map as IMap } from 'immutable';

import { RaceTrack, RegionDisplayType } from '../../../components/RaceTrack';
import { Language } from '../../../components/Language';
import { V2TrackSelect } from '../../v2/track-select';
import { SkillChip, SkillPickerModal, type SkillDataSource } from '../../v2/skills';
import { CompareModal } from './compare-modal';
import { loadJpSkillData } from './jp-data-loader';

import skills from '../../../uma-skill-tools/data/skill_data.json';
import skillnames from '../../../uma-skill-tools/data/skillnames.json';
import skillmeta from '../../../skill_meta.json';

// Bundled imports are Global data (via the redirectData esbuild plugin in
// build.mjs). This is the source used for the default per-card view and for
// the "Global" column of the compare modal.
const GLOBAL_SOURCE: SkillDataSource = {
	skills:     skills     as Record<string, any>,
	skillnames: skillnames as Record<string, string[]>,
	skillmeta:  skillmeta  as Record<string, any>,
};

import { Region, RegionList } from '../../../uma-skill-tools/Region';
import { CourseData, CourseHelpers } from '../../../uma-skill-tools/CourseData';
import { HorseParameters, Strategy, Aptitude } from '../../../uma-skill-tools/HorseTypes';
import { getParser } from '../../../uma-skill-tools/ConditionParser';
import { buildSkillData, conditionsWithActivateCountsAsRandom } from '../../../uma-skill-tools/RaceSolverBuilder';
import { ImmediatePolicy } from '../../../uma-skill-tools/ActivationSamplePolicy';
import { immediate, noopImmediate } from '../../../uma-skill-tools/ActivationConditions';

import '../../v2/v2.css';
import '../../../components/Tooltip.css';
import './app-v2.css';

const DefaultCourseId = 10903;

const UI = Object.freeze({
	'title': 'Skill Activation Visualizer',
	'addskill': '+ Add Skill',
	'thresholds': 'Stat thresholds: ',
	'stats': Object.freeze(['None', 'Speed', 'Stamina', 'Power', 'Guts', 'Wisdom']),
	'joiner': ', ',
	'notice': Object.freeze({
		'dna': 'This skill does not activate on this track',
		'error': 'Error parsing activation conditions'
	})
});

const horse = Object.freeze({
	speed: 2000,
	stamina: 2000,
	power: 2000,
	guts: 2000,
	wisdom: 2000,
	strategy: Strategy.Nige,
	distanceAptitude: Aptitude.S,
	surfaceAptitude: Aptitude.A,
	strategyAptitude: Aptitude.A,
	rawStamina: 2000,
	rawWisdom: 2000
});

function baseSpeed(distance: number) {
	return 20.0 - (distance - 2000) / 1000.0;
}

const conditions = Object.freeze(Object.assign({}, conditionsWithActivateCountsAsRandom, {
	accumulatetime: immediate({
		filterGte(regions: RegionList, t: number, course: CourseData, _: HorseParameters) {
			const estimate = new Region(baseSpeed(course.distance) * t, course.distance);
			return regions.rmap(r => r.intersect(estimate));
		}
	}),
	grade: noopImmediate,
	ground_condition: noopImmediate,
	is_used_skill_id: noopImmediate,
	motivation: noopImmediate,
	popularity: noopImmediate,
	running_style: noopImmediate,
	season: noopImmediate,
	time: noopImmediate,
	weather: noopImmediate
}));

const parser = getParser(conditions);

function regionsForSkill(course: CourseData, skillId: string, color: {stroke: string, fill: string}) {
	const wholeCourse = new RegionList();
	wholeCourse.push(new Region(0, course.distance));
	try {
		const sds = buildSkillData(horse, {}, course, wholeCourse, parser, skillId, true);
		if (sds.length == 0) return {err: false, type: RegionDisplayType.Immediate, regions: [], color};
		const sd = sds[0];
		return {
			err: false,
			type: sd.samplePolicy == ImmediatePolicy ? RegionDisplayType.Immediate : RegionDisplayType.Regions,
			regions: sd.regions,
			color,
			height: 100
		};
	} catch (e) {
		return {err: true, type: RegionDisplayType.Immediate, regions: [], color};
	}
}

function doesNotActivate(skillRegions: {regions: Region[]}) {
	return !skillRegions || skillRegions.regions.length == 0 || skillRegions.regions[0].start == 9999;
}

const colors = [
	{stroke: 'rgb(205,11,11)', fill: 'rgba(247,115,115,0.3)'},
	{stroke: 'rgb(28,61,106)', fill: 'rgba(47,103,177,0.3)'},
	{stroke: 'rgb(114,76,132)', fill: 'rgba(182,153,196,0.3)'},
	{stroke: 'rgb(36,106,99)', fill: 'rgba(61,177,166,0.3)'}
];

function App() {
	const [courseId, setCourseId] = useState(() => +(/cid=(\d+)/.exec(window.location.hash) || [null, DefaultCourseId])[1]);
	const [selectedSkills, setSelectedSkills] = useState(() => {
		const ids = (/sid=(\d+(?:,\d+)*)/.exec(window.location.hash) || [null, ''])[1].split(',').filter(Boolean);
		return IMap(ids.map(id => [skillmeta[id]?.groupId ?? id, id]));
	});
	const [skillsOpen, setSkillsOpen] = useState(false);

	// Per-card data source choice. Default to 'global' on first add (no entry).
	const [cardVersions, setCardVersions] = useState<IMap<string, 'global' | 'jp'>>(IMap());
	// Per-card "JP load in progress" indicator (for spinner during first fetch).
	const [loadingVersions, setLoadingVersions] = useState<IMap<string, boolean>>(IMap());
	// JP source, populated lazily on first need.
	const [jpSource, setJpSource] = useState<SkillDataSource | null>(null);
	const [jpLoadError, setJpLoadError] = useState<string | null>(null);
	// Compare modal target.
	const [compareSkillId, setCompareSkillId] = useState<string | null>(null);

	// Lazy-load JP data on first need. Subsequent calls reuse the cached Promise.
	const ensureJpLoaded = useCallback(async () => {
		if (jpSource) return jpSource;
		try {
			const src = await loadJpSkillData();
			setJpSource(src);
			setJpLoadError(null);
			return src;
		} catch (e: any) {
			const msg = e?.message ?? String(e);
			setJpLoadError(msg);
			throw e;
		}
	}, [jpSource]);

	const handleVersionChange = useCallback(async (skillId: string, version: 'global' | 'jp') => {
		// Optimistically update the toggle state immediately
		setCardVersions(prev => prev.set(skillId, version));
		if (version === 'jp' && !jpSource) {
			setLoadingVersions(prev => prev.set(skillId, true));
			try {
				await ensureJpLoaded();
			} catch {
				// On failure, revert toggle to global; jpLoadError state surfaces the cause
				setCardVersions(prev => prev.set(skillId, 'global'));
			} finally {
				setLoadingVersions(prev => prev.delete(skillId));
			}
		}
	}, [jpSource, ensureJpLoaded]);

	const handleCompare = useCallback(async (skillId: string) => {
		setCompareSkillId(skillId);
		if (!jpSource) {
			try { await ensureJpLoaded(); } catch { /* error displayed inside the modal column */ }
		}
	}, [jpSource, ensureJpLoaded]);

	const addSkill = useCallback((skillId: string) => {
		const groupId = skillmeta[skillId]?.groupId ?? skillId;
		setSelectedSkills(prev => prev.set(groupId, skillId));
	}, []);

	const removeSkill = useCallback((id: string) => {
		const groupId = skillmeta[id]?.groupId ?? id;
		setSelectedSkills(prev => prev.delete(groupId));
	}, []);

	// Build intl strings
	const strings = useMemo(() => {
		const s: any = {skillnames: {}, ui: UI};
		Object.keys(skillnames).forEach(id => s.skillnames[id] = (skillnames as any)[id][1] || (skillnames as any)[id][0]);
		return s;
	}, []);

	const course = CourseHelpers.getCourse(courseId);
	const skillIds = useMemo(() => selectedSkills.valueSeq().toArray(), [selectedSkills]);
	const regions = useMemo(() => skillIds.map((id, i) => regionsForSkill(course, id, colors[i % colors.length])), [skillIds, course]);

	// Update URL hash
	useEffect(() => {
		const hash = `#cid=${courseId}${selectedSkills.size == 0 ? '' : '&sid='}${skillIds.join(',')}`;
		window.location.replace(hash);
	}, [courseId, skillIds]);

	return (
		<Language.Provider value={'en'}>
			<IntlProvider definition={strings}>
				<div class="sv2-app">
					<div class="sv2-header">
						<h1>Skill Activation Visualizer</h1>
					</div>

					<div class="sv2-track-area">
						<div class="sv2-track-controls">
							<V2TrackSelect courseid={courseId} setCourseid={setCourseId} />
						</div>
						<RaceTrack courseid={courseId} width={1040} height={220} regions={regions} />
					</div>

					<div class="sv2-skills-area">
						{skillIds.map((id, i) => {
							const hasError = regions[i].err;
							const dna = !hasError && doesNotActivate(regions[i]);
							const hasNotice = hasError || dna;
							const version = cardVersions.get(id) ?? 'global';
							const isLoading = !!loadingVersions.get(id);
							const activeSource = version === 'jp'
								? (jpSource ?? GLOBAL_SOURCE)  // fall back to Global if JP isn't loaded yet
								: GLOBAL_SOURCE;
							return (
								<div class={`sv2-skill-card${hasNotice ? ' has-notice' : ''}`} key={id}>
									<div class="sv2-skill-card-color" style={`background:${colors[i % colors.length].stroke}`} />
									{hasError && <div class="sv2-skill-card-notice error" title={UI.notice.error}>x</div>}
									{dna && <div class="sv2-skill-card-notice dna" title={UI.notice.dna}>!</div>}
									<SkillChip
										skillId={id}
										onRemove={() => removeSkill(id)}
										courseDistance={course.distance}
										dataSource={activeSource}
										enableVersionToggle
										activeVersion={version}
										onVersionChange={v => handleVersionChange(id, v)}
										isVersionLoading={isLoading}
										onCompare={() => handleCompare(id)}
									/>
								</div>
							);
						})}
						<button class="sv2-add-skill" onClick={() => setSkillsOpen(true)}>
							+ Add Skill
						</button>
					</div>

					<SkillPickerModal
						isOpen={skillsOpen}
						onClose={() => setSkillsOpen(false)}
						onSelect={addSkill}
						selectedSkills={skillIds}
						hideNotInGame={false}
					/>

					<CompareModal
						skillId={compareSkillId}
						globalSource={GLOBAL_SOURCE}
						jpSource={jpSource}
						jpLoadError={jpLoadError}
						courseDistance={course.distance}
						onClose={() => setCompareSkillId(null)}
					/>
				</div>
			</IntlProvider>
		</Language.Provider>
	);
}

render(<App />, document.getElementById('app')!);
