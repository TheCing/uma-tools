import { h, Fragment } from 'preact';
import { useState, useReducer, useMemo, useEffect, useRef } from 'preact/hooks';
import { IntlProvider, Text, Localizer } from 'preact-i18n';
import { Set as ImmSet } from 'immutable';

import { SkillList, Skill, ExpandedSkillDetails } from '../components/SkillList';
import { OCRModal } from './OCRModal';
import { OCRHorseData, mapSkillNamesToIds, mapOutfitNameToId } from './GeminiOCR';
import { createUmaCard, extractDataFromPng } from './UmaCard';

import { HorseParameters } from '../uma-skill-tools/HorseTypes';

import { SkillSet, HorseState } from './HorseDefTypes';

import './HorseDef.css';

import umas from '../umas.json';
import icons from '../icons.json';
import skilldata from '../uma-skill-tools/data/skill_data.json';
import skillmeta from '../skill_meta.json';

// Convert HorseState (Immutable Record) to plain JSON object
function horseStateToJson(horse: HorseState) {
	return {
		outfitId: horse.outfitId,
		speed: horse.speed,
		stamina: horse.stamina,
		power: horse.power,
		guts: horse.guts,
		wisdom: horse.wisdom,
		strategy: horse.strategy,
		distanceAptitude: horse.distanceAptitude,
		surfaceAptitude: horse.surfaceAptitude,
		strategyAptitude: horse.strategyAptitude,
		mood: horse.mood,
		skills: Array.from(horse.skills.values()),
		forcedSkillPositions: horse.forcedSkillPositions.toJS(),
	};
}

// Export horse state as JSON file download
function downloadHorseJson(horse: HorseState) {
	const json = horseStateToJson(horse);
	const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	const name = horse.outfitId ? umas[horse.outfitId.slice(0, 4)]?.name[1] || 'horse' : 'horse';
	a.download = `${name.replace(/\s+/g, '_')}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

// Export horse state as Uma Card PNG
async function downloadUmaCard(horse: HorseState) {
	try {
		const json = horseStateToJson(horse);
		const cardBlob = await createUmaCard(horse.outfitId, json);
		const url = URL.createObjectURL(cardBlob);
		const a = document.createElement('a');
		a.href = url;
		const name = horse.outfitId ? umas[horse.outfitId.slice(0, 4)]?.name[1] || 'horse' : 'horse';
		a.download = `${name.replace(/\s+/g, '_')}_card.png`;
		a.click();
		URL.revokeObjectURL(url);
	} catch (error) {
		console.error('Failed to create uma card:', error);
		alert('Failed to create uma card. Please try again.');
	}
}

// Validate and convert JSON to HorseState
function validateAndParseHorseJson(json: any): HorseState | null {
	// Check required numeric fields
	const numericFields = ['speed', 'stamina', 'power', 'guts', 'wisdom', 'mood'];
	for (const field of numericFields) {
		if (typeof json[field] !== 'number') return null;
	}

	// Check required string fields
	const stringFields = ['strategy', 'distanceAptitude', 'surfaceAptitude', 'strategyAptitude'];
	for (const field of stringFields) {
		if (typeof json[field] !== 'string') return null;
	}

	// Validate strategy
	const validStrategies = ['Nige', 'Senkou', 'Sasi', 'Oikomi', 'Oonige'];
	if (!validStrategies.includes(json.strategy)) return null;

	// Validate aptitudes
	const validAptitudes = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
	if (!validAptitudes.includes(json.distanceAptitude)) return null;
	if (!validAptitudes.includes(json.surfaceAptitude)) return null;
	if (!validAptitudes.includes(json.strategyAptitude)) return null;

	// Validate mood (-2 to 2)
	if (json.mood < -2 || json.mood > 2) return null;

	// Validate skills is an array
	if (!Array.isArray(json.skills)) return null;

	// Build the HorseState
	let horse = new HorseState({
		outfitId: json.outfitId || '',
		speed: json.speed,
		stamina: json.stamina,
		power: json.power,
		guts: json.guts,
		wisdom: json.wisdom,
		strategy: json.strategy,
		distanceAptitude: json.distanceAptitude,
		surfaceAptitude: json.surfaceAptitude,
		strategyAptitude: json.strategyAptitude,
		mood: json.mood,
		skills: SkillSet(json.skills.filter(id => typeof id === 'string' && skilldata[id.split('-')[0]])),
	});

	// Handle forcedSkillPositions if present
	if (json.forcedSkillPositions && typeof json.forcedSkillPositions === 'object') {
		const { Map: ImmMap } = require('immutable');
		horse = horse.set('forcedSkillPositions', ImmMap(json.forcedSkillPositions));
	}

	return horse;
}

const umaAltIds = Object.keys(umas).flatMap(id => Object.keys(umas[id].outfits));
const umaNamesForSearch = {};
umaAltIds.forEach(id => {
	const u = umas[id.slice(0,4)];
	umaNamesForSearch[id] = (u.outfits[id] + ' ' + u.name[1]).toUpperCase().replace(/\./g, '');
});

function searchNames(query) {
	const q = query.toUpperCase().replace(/\./g, '');
	return umaAltIds.filter(oid => umaNamesForSearch[oid].indexOf(q) > -1);
}

export function UmaSelector(props) {
	const randomMob = useMemo(() => `/uma-tools/icons/mob/trained_mob_chr_icon_${8000 + Math.floor(Math.random() * 624)}_000001_01.png`, []);
	const u = props.value && umas[props.value.slice(0,4)];

	const input = useRef(null);
	const fileInput = useRef(null);
	const suggestionsContainer = useRef(null);

	async function handleFileSelect(e) {
		const file = e.target.files?.[0];
		if (!file) return;

		try {
			// Check if it's a PNG file (uma card)
			if (file.type === 'image/png' || file.name.endsWith('.png')) {
				const cardData = await extractDataFromPng(file);
				if (cardData) {
					const horse = validateAndParseHorseJson(cardData);
					if (horse && props.onLoad) {
						props.onLoad(horse);
					} else {
						alert('Invalid uma card data. Please check the file format.');
					}
				} else {
					alert('No uma card data found in PNG. Please use a valid uma card image.');
				}
			} else {
				// Handle JSON file
				const reader = new FileReader();
				reader.onload = (event) => {
					try {
						const json = JSON.parse(event.target.result as string);
						const horse = validateAndParseHorseJson(json);
						if (horse && props.onLoad) {
							props.onLoad(horse);
						} else {
							alert('Invalid horse JSON file. Please check the file format.');
						}
					} catch (err) {
						alert('Failed to parse JSON file: ' + err.message);
					}
				};
				reader.readAsText(file);
			}
		} catch (err) {
			alert('Failed to load file: ' + err.message);
		} finally {
			// Reset file input so same file can be selected again
			e.target.value = '';
		}
	}

	function triggerFileInput() {
		fileInput.current?.click();
	}

	const [loadDropdownOpen, setLoadDropdownOpen] = useState(false);
	const loadDropdownRef = useRef(null);
	const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
	const saveDropdownRef = useRef(null);

	function handleLoadOptionClick(option: 'json' | 'ocr') {
		setLoadDropdownOpen(false);
		if (option === 'json') {
			triggerFileInput();
		} else if (option === 'ocr') {
			props.onOpenOCR?.();
		}
	}

	function handleSaveOptionClick(option: 'json' | 'card') {
		setSaveDropdownOpen(false);
		if (option === 'json') {
			props.onSave?.();
		} else if (option === 'card') {
			props.onSaveCard?.();
		}
	}

	function handleLoadDropdownBlur(e) {
		// Close dropdown if clicking outside
		if (loadDropdownRef.current && !loadDropdownRef.current.contains(e.relatedTarget)) {
			setLoadDropdownOpen(false);
		}
	}

	function handleSaveDropdownBlur(e) {
		// Close dropdown if clicking outside
		if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.relatedTarget)) {
			setSaveDropdownOpen(false);
		}
	}

	function handleSaveButtonClick() {
		setLoadDropdownOpen(false); // Close load dropdown
		setSaveDropdownOpen(!saveDropdownOpen);
	}

	function handleLoadButtonClick() {
		setSaveDropdownOpen(false); // Close save dropdown
		setLoadDropdownOpen(!loadDropdownOpen);
	}

	const [open, setOpen] = useState(false);
	const [activeIdx, setActiveIdx] = useState(-1);
	function update(q) {
		return {input: q, suggestions: searchNames(q)};
	}
	const [query, search] = useReducer((_,q) => update(q), u && u.name[1], update);

	function confirm(oid) {
		setOpen(false);
		props.select(oid);
		const uname = umas[oid.slice(0,4)].name[1];
		search(uname);
		setActiveIdx(-1);
		if (input.current != null) {
			input.current.value = uname;
			input.current.blur();
		}
	}

	function focus() {
		input.current && input.current.select();
	}

	function setActiveAndScroll(idx) {
		setActiveIdx(idx);
		if (!suggestionsContainer.current) return;
		const container = suggestionsContainer.current;
		const li = container.querySelector(`[data-uma-id="${query.suggestions[idx]}"]`);
		const ch = container.offsetHeight - 4;  // 4 for borders
		if (li.offsetTop < container.scrollTop) {
			container.scrollTop = li.offsetTop;
		} else if (li.offsetTop >= container.scrollTop + ch) {
			const h = li.offsetHeight;
			container.scrollTop = (li.offsetTop / h - (ch / h - 1)) * h;
		}
	}

	function handleClick(e) {
		const li = e.target.closest('.umaSuggestion');
		if (li == null) return;
		e.stopPropagation();
		confirm(li.dataset.umaId);
	}

	function handleInput(e) {
		search(e.target.value);
	}

	function handleKeyDown(e) {
		const l = query.suggestions.length;
		switch (e.keyCode) {
			case 13:
				if (activeIdx > -1) confirm(query.suggestions[activeIdx]);
				break;
			case 38:
				setActiveAndScroll((activeIdx - 1 + l) % l);
				break;
			case 40:
				setActiveAndScroll((activeIdx + 1 + l) % l);
				break;
		}
	}

	function handleBlur(e) {
		if (e.target.value.length == 0) props.select('');
		setOpen(false);
	}

	return (
		<div class="umaSelector">
			<div class="umaSelectorIconsBox" onClick={focus}>
				<img src={props.value ? icons[props.value] : randomMob} />
				<img src="/uma-tools/icons/utx_ico_umamusume_00.png" />
			</div>
			<div class="umaEpithet"><span>{props.value && u.outfits[props.value]}</span></div>
			<div class="resetButtons">
				{props.onSave && (
					<div className="loadButtonWrapper" ref={saveDropdownRef} onBlur={handleSaveDropdownBlur}>
						<button className="saveUmaButton" onClick={handleSaveButtonClick} title="Export this horse">
							Save <span className={`loadDropdownArrow ${saveDropdownOpen ? 'open' : ''}`} />
						</button>
						<ul className={`loadDropdownMenu ${saveDropdownOpen ? 'open' : ''}`}>
							<li onMouseDown={() => handleSaveOptionClick('json')}>JSON File</li>
							<li onMouseDown={() => handleSaveOptionClick('card')}>Uma Card (PNG)</li>
						</ul>
					</div>
				)}
				{props.onLoad && (
					<div className="loadButtonWrapper" ref={loadDropdownRef} onBlur={handleLoadDropdownBlur}>
						<button className="loadUmaButton" onClick={handleLoadButtonClick} title="Import horse data">
							Load <span className={`loadDropdownArrow ${loadDropdownOpen ? 'open' : ''}`} />
						</button>
						<ul className={`loadDropdownMenu ${loadDropdownOpen ? 'open' : ''}`}>
							<li onMouseDown={() => handleLoadOptionClick('json')}>JSON/PNG</li>
							<li onMouseDown={() => handleLoadOptionClick('ocr')}>OCR Screenshot</li>
						</ul>
					</div>
				)}
				{props.onReset && <button className="resetUmaButton" onClick={props.onReset} title="Reset this horse to default stats and skills">Reset</button>}
				{props.onResetAll && <button className="resetUmaButton" onClick={props.onResetAll} title="Reset all horses to default stats and skills">Reset All</button>}
			</div>
			<div class="umaSelectWrapper">
				<input type="text" class="umaSelectInput" value={query.input} tabindex={props.tabindex} onInput={handleInput} onKeyDown={handleKeyDown} onFocus={() => setOpen(true)} onBlur={handleBlur} ref={input} />
				<ul class={`umaSuggestions ${open ? 'open' : ''}`} onMouseDown={handleClick} ref={suggestionsContainer}>
					{query.suggestions.map((oid, i) => {
						const uid = oid.slice(0,4);
						return (
							<li key={oid} data-uma-id={oid} class={`umaSuggestion ${i == activeIdx ? 'selected' : ''}`}>
								<img src={icons[oid]} loading="lazy" /><span>{umas[uid].outfits[oid]} {umas[uid].name[1]}</span>
							</li>
						);
					})}
				</ul>
			</div>
			<input type="file" accept=".json,.png" ref={fileInput} style={{ display: 'none' }} onChange={handleFileSelect} />
		</div>
	);
}

function rankForStat(x: number) {
	if (x > 1200) {
		// over 1200 letter (eg UG) goes up by 100 and minor number (eg UG8) goes up by 10
		return Math.min(18 + Math.floor((x - 1200) / 100) * 10 + Math.floor(x / 10) % 10, 97);
	} else if (x >= 1150) {
		return 17; // SS+
	} else if (x >= 1100) {
		return 16; // SS
	} else if (x >= 400) {
		// between 400 and 1100 letter goes up by 100 starting with C (8)
		return 8 + Math.floor((x - 400) / 100);
	} else {
		// between 1 and 400 letter goes up by 50 starting with G+ (0)
		return Math.floor(x / 50);
	}
}

export function Stat(props) {
	return (
		<div class="horseParam">
			<img src={`/uma-tools/icons/statusrank/ui_statusrank_${(100 + rankForStat(props.value)).toString().slice(1)}.png`} />
			<input type="number" min="1" max="2000" value={props.value} tabindex={props.tabindex} onInput={(e) => props.change(+e.currentTarget.value)} />
		</div>
	);
}

const APTITUDES = Object.freeze(['S','A','B','C','D','E','F','G']);
export function AptitudeIcon(props) {
	const idx = 7 - APTITUDES.indexOf(props.a);
	return <img src={`/uma-tools/icons/utx_ico_statusrank_${(100 + idx).toString().slice(1)}.png`} loading="lazy" />;
}

export function AptitudeSelect(props){
	const [open, setOpen] = useState(false);
	function setAptitude(e) {
		e.stopPropagation();
		props.setA(e.currentTarget.dataset.horseAptitude);
		setOpen(false);
	}
	function selectByKey(e: KeyboardEvent) {
		const k = e.key.toUpperCase();
		if (APTITUDES.indexOf(k) > -1) {
			props.setA(k);
		}
	}
	return (
		<div class="horseAptitudeSelect" tabindex={props.tabindex} onClick={() => setOpen(!open)} onBlur={setOpen.bind(null, false)} onKeyDown={selectByKey}>
			<span><AptitudeIcon a={props.a} /></span>
			<ul style={open ? "display:block" : "display:none"}>
				{APTITUDES.map(a => <li key={a} data-horse-aptitude={a} onClick={setAptitude}><AptitudeIcon a={a} /></li>)}
			</ul>
		</div>
	);
}

export function MoodSelect(props){
	const [open, setOpen] = useState(false);
	const moodValues = [
		{value: 2, icon: 'utx_ico_motivation_m_04', label: 'Great'},
		{value: 1, icon: 'utx_ico_motivation_m_03', label: 'Good'},
		{value: 0, icon: 'utx_ico_motivation_m_02', label: 'Normal'},
		{value: -1, icon: 'utx_ico_motivation_m_01', label: 'Bad'},
		{value: -2, icon: 'utx_ico_motivation_m_00', label: 'Awful'}
	];
	
	function setMood(e) {
		e.stopPropagation();
		props.setM(+e.currentTarget.dataset.mood);
		setOpen(false);
	}
	
	return (
		<div class="horseMoodSelect" tabindex={props.tabindex} onClick={() => setOpen(!open)} onBlur={setOpen.bind(null, false)}>
			<span>
				<img src={`/uma-tools/icons/global/${moodValues.find(m => m.value === props.m)?.icon}.png`} />
			</span>
			<ul style={open ? "display:block" : "display:none"}>
				{moodValues.map(mood => 
					<li key={mood.value} data-mood={mood.value} onClick={setMood}>
						<img src={`/uma-tools/icons/global/${mood.icon}.png`} title={mood.label} />
					</li>
				)}
			</ul>
		</div>
	);
}

export function StrategySelect(props) {
	const disabled = props.disabled || false;
	if (CC_GLOBAL) {
		return (
			<select class="horseStrategySelect" value={props.s} tabindex={props.tabindex} disabled={disabled} onInput={(e) => props.setS(e.currentTarget.value)}>
				<option value="Oonige">Runaway</option>
				<option value="Nige">Front Runner</option>
				<option value="Senkou">Pace Chaser</option>
				<option value="Sasi">Late Surger</option>
				<option value="Oikomi">End Closer</option>
			</select>
		);
	}
	return (
		<select class="horseStrategySelect" value={props.s} tabindex={props.tabindex} disabled={disabled} onInput={(e) => props.setS(e.currentTarget.value)}>
			<option value="Nige">逃げ</option>
			<option value="Senkou">先行</option>
			<option value="Sasi">差し</option>
			<option value="Oikomi">追込</option>
			<option value="Oonige">大逃げ</option>
		</select>
	);
}

const nonUniqueSkills = Object.keys(skilldata).filter(id => skilldata[id].rarity < 3 || skilldata[id].rarity > 5);
const universallyAccessiblePinks = ['92111091' /* welfare kraft alt pink unique inherit */].concat(Object.keys(skilldata).filter(id => id[0] == '4'));

export function isGeneralSkill(id: string) {
	return skilldata[id].rarity < 3 || universallyAccessiblePinks.indexOf(id) > -1;
}

function assertIsSkill(sid: string): asserts sid is keyof typeof skilldata {
	console.assert(skilldata[sid] != null);
}

function uniqueSkillForUma(oid: typeof umaAltIds[number]): keyof typeof skilldata {
	const i = +oid.slice(1, -2), v = +oid.slice(-2);
	const sid = (100000 + 10000 * (v - 1) + i * 10 + 1).toString();
	assertIsSkill(sid);
	return sid;
}

function skillOrder(a, b) {
	const x = skillmeta[a].order, y = skillmeta[b].order;
	return +(y < x) - +(x < y) || +(b < a) - +(a < b);
}

let totalTabs = 0;
export function horseDefTabs() {
	return totalTabs;
}

export function HorseDef(props) {
	const {state, setState} = props;
	const [skillPickerOpen, setSkillPickerOpen] = useState(false);
	const [expanded, setExpanded] = useState(() => ImmSet());
	const [ocrModalOpen, setOcrModalOpen] = useState(false);

	const tabstart = props.tabstart();
	let tabi = 0;
	function tabnext() {
		if (++tabi > totalTabs) totalTabs = tabi;
		return tabstart + tabi - 1;
	}

	const umaId = state.outfitId;
	const selectableSkills = useMemo(() => nonUniqueSkills.filter(id => skilldata[id].rarity != 6 || id.startsWith(umaId) || universallyAccessiblePinks.indexOf(id) != -1), [umaId]);

	function setter(prop: keyof HorseState) {
		return (x) => setState(state.set(prop, x));
	}
	const setSkills = setter('skills');

	function setUma(id) {
		let newSkills = state.skills.filter(isGeneralSkill);

		if (id) {
			const uid = uniqueSkillForUma(id);
			newSkills = newSkills.set(skillmeta[uid].groupId, uid);
		}

		const removedSkillIds = state.skills.keySeq().toSet().subtract(newSkills.keySeq().toSet());
		let newForcedPositions = state.forcedSkillPositions;
		removedSkillIds.forEach(skillId => {
			newForcedPositions = newForcedPositions.delete(skillId);
		});

		setState(
			state.set('outfitId', id)
				.set('skills', newSkills)
				.set('forcedSkillPositions', newForcedPositions)
		);
	}

	function resetThisHorse() {
		setState(new HorseState());
	}

	function saveThisHorse() {
		downloadHorseJson(state);
	}

	function saveCardThisHorse() {
		downloadUmaCard(state);
	}

	function loadThisHorse(horse: HorseState) {
		setState(horse);
	}

	function handleOCRConfirm(data: OCRHorseData) {
		// Convert OCR data to HorseState
		const outfitId = mapOutfitNameToId(data.outfit || '');
		let skillIds = mapSkillNamesToIds(data.skills || []);

		// Add the unique skill for this outfit if we have a valid outfit ID
		if (outfitId) {
			const uniqueSkillId = uniqueSkillForUma(outfitId);
			const uniqueBaseId = uniqueSkillId.split('-')[0];
			const goldVersionId = '9' + uniqueBaseId.slice(1);
			const isUmasOwnUniqueVariant = (id: string) => {
				const baseId = id.split('-')[0];
				return baseId === uniqueBaseId || baseId === goldVersionId;
			};
			skillIds = skillIds.filter(id => !isUmasOwnUniqueVariant(id));
			skillIds.unshift(uniqueSkillId);
		}

		const horse = new HorseState({
			outfitId: outfitId,
			speed: data.speed,
			stamina: data.stamina,
			power: data.power,
			guts: data.guts,
			wisdom: data.wisdom,
			strategy: data.strategy,
			distanceAptitude: data.distanceAptitude,
			surfaceAptitude: data.surfaceAptitude,
			strategyAptitude: data.strategyAptitude,
			mood: 2,
			skills: SkillSet(skillIds),
		});
		setState(horse);
	}

	function openOCRModal() {
		setOcrModalOpen(true);
	}

	function openSkillPicker(e) {
		e.stopPropagation();
		setSkillPickerOpen(true);
	}

	function setSkillsAndClose(skills) {
		setSkills(skills);
		setSkillPickerOpen(false);
	}

	function handleSkillClick(e) {
		e.stopPropagation();
		// Don't toggle expansion if clicking on position input
		if (e.target.classList.contains('forcedPositionInput')) {
			return;
		}
		const se = e.target.closest('.skill, .expandedSkill');
		if (se == null) return;
		if (e.target.classList.contains('skillDismiss')) {
			// can't just remove skillmeta[skillid].groupId because debuffs will have a fake groupId
			const skillId = se.dataset.skillid;
			setState(
				state.set('skills', state.skills.delete(state.skills.findKey(id => id == skillId)))
					.set('forcedSkillPositions', state.forcedSkillPositions.delete(skillId))
			);
		} else if (se.classList.contains('expandedSkill')) {
			setExpanded(expanded.delete(se.dataset.skillid));
		} else {
			setExpanded(expanded.add(se.dataset.skillid));
		}
	}

	function handlePositionChange(skillId: string, value: string) {
		const numValue = parseFloat(value);
		if (value === '' || isNaN(numValue)) {
			// Clear the forced position
			setState(state.set('forcedSkillPositions', state.forcedSkillPositions.delete(skillId)));
		} else {
			// Set the forced position
			setState(state.set('forcedSkillPositions', state.forcedSkillPositions.set(skillId, numValue)));
		}
	}

	useEffect(function () {
		window.requestAnimationFrame(() =>
			document.querySelectorAll('.horseExpandedSkill').forEach(e => {
				(e as HTMLElement).style.gridRow = 'span ' + Math.ceil((e.firstChild as HTMLElement).offsetHeight / 64);
			})
		);
	}, [expanded]);

	useEffect(function () {
		const currentSkillIds = state.skills.keySeq().toSet();
		const forcedPositionSkillIds = state.forcedSkillPositions.keySeq().toSet();
		const orphanedSkillIds = forcedPositionSkillIds.subtract(currentSkillIds);
		if (orphanedSkillIds.size > 0) {
			let newForcedPositions = state.forcedSkillPositions;
			orphanedSkillIds.forEach(skillId => {
				newForcedPositions = newForcedPositions.delete(skillId);
			});
			setState(state.set('forcedSkillPositions', newForcedPositions));
		}
	}, [state.skills]);

	const hasRunawaySkill = state.skills.has('202051');
	useEffect(function () {
		if (hasRunawaySkill && state.strategy !== 'Oonige') {
			setState(state.set('strategy', 'Oonige'));
		}
	}, [hasRunawaySkill, state.strategy]);

	const skillList = useMemo(function () {
		const u = uniqueSkillForUma(umaId);
		return Array.from(state.skills.values()).sort(skillOrder).map(id =>
			expanded.has(id)
				? <li key={id} class="horseExpandedSkill">
					  <ExpandedSkillDetails 
						  id={id} 
						  distanceFactor={props.courseDistance} 
						  dismissable={id != u}
						  forcedPosition={state.forcedSkillPositions.get(id) || ''}
						  onPositionChange={(value: string) => handlePositionChange(id, value)}
					  />
				  </li>
				: <li key={id} style="">
					  <Skill id={id} selected={false} dismissable={id != u} />
						  {state.forcedSkillPositions.has(id) && (
							  <span class="forcedPositionLabel inline">
								  @{state.forcedSkillPositions.get(id)}m
							  </span>
						  )}
				  </li>
		);
	}, [state.skills, umaId, expanded, props.courseDistance, state.forcedSkillPositions]);

	return (
		<div class="horseDef">
			<div class="horseDefHeader">{props.children}</div>
			<UmaSelector value={umaId} select={setUma} tabindex={tabnext()} onSave={saveThisHorse} onSaveCard={saveCardThisHorse} onLoad={loadThisHorse} onOpenOCR={openOCRModal} onReset={resetThisHorse} onResetAll={props.onResetAll} />
			<div class="horseParams">
				<div class="horseParamHeader"><img src="/uma-tools/icons/status_00.png" /><span>Speed</span></div>
				<div class="horseParamHeader"><img src="/uma-tools/icons/status_01.png" /><span>Stamina</span></div>
				<div class="horseParamHeader"><img src="/uma-tools/icons/status_02.png" /><span>Power</span></div>
				<div class="horseParamHeader"><img src="/uma-tools/icons/status_03.png" /><span>Guts</span></div>
				<div class="horseParamHeader"><img src="/uma-tools/icons/status_04.png" /><span>{CC_GLOBAL?'Wit':'Wisdom'}</span></div>
				<Stat value={state.speed} change={setter('speed')} tabindex={tabnext()} />
				<Stat value={state.stamina} change={setter('stamina')} tabindex={tabnext()} />
				<Stat value={state.power} change={setter('power')} tabindex={tabnext()} />
				<Stat value={state.guts} change={setter('guts')} tabindex={tabnext()} />
				<Stat value={state.wisdom} change={setter('wisdom')} tabindex={tabnext()} />
			</div>
			<div class="horseAptitudes">
				<div>
					<span>Surface aptitude:</span>
					<AptitudeSelect a={state.surfaceAptitude} setA={setter('surfaceAptitude')} tabindex={tabnext()} />
				</div>
				<div>
					<span>Distance aptitude:</span>
					<AptitudeSelect a={state.distanceAptitude} setA={setter('distanceAptitude')} tabindex={tabnext()} />
				</div>
				<div>
					<span>Mood:</span>
					<MoodSelect m={state.mood} setM={setter('mood')} tabindex={tabnext()} />
				</div>
				<div>
					<span>{CC_GLOBAL ? 'Style:' : 'Strategy:'}</span>
					<StrategySelect s={state.strategy} setS={setter('strategy')} disabled={hasRunawaySkill} tabindex={tabnext()} />
				</div>
				<div>
					<span>{CC_GLOBAL ? 'Style aptitude:' : 'Strategy aptitude:'}</span>
					<AptitudeSelect a={state.strategyAptitude} setA={setter('strategyAptitude')} tabindex={tabnext()} />
				</div>
			</div>
			<div class="horseSkillHeader">Skills</div>
			<div class="horseSkillListWrapper" onClick={handleSkillClick}>
				<ul class="horseSkillList">
					{skillList}
					<li key="add">
						<div class="skill addSkillButton" onClick={openSkillPicker} tabindex={tabnext()}>
							<span>+</span>Add Skill
						</div>
					</li>
				</ul>
			</div>
			<div class={`horseSkillPickerOverlay ${skillPickerOpen ? "open" : ""}`} onClick={setSkillPickerOpen.bind(null, false)} />
			<div class={`horseSkillPickerWrapper ${skillPickerOpen ? "open" : ""}`}>
				<SkillList ids={selectableSkills} selected={state.skills} setSelected={setSkillsAndClose} isOpen={skillPickerOpen} />
			</div>
			<OCRModal
				open={ocrModalOpen}
				onClose={() => setOcrModalOpen(false)}
				onConfirm={handleOCRConfirm}
			/>
		</div>
	);
}
