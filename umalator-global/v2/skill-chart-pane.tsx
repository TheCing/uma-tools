/**
 * Skill Chart Pane Component
 *
 * Main table for skill chart mode with TanStack table
 */

import { h, Fragment } from 'preact';
import { useState, useMemo, useId, useRef } from 'preact/hooks';
import {
	type ColumnDef, type SortingState,
	useReactTable, flexRender, getSortedRowModel, getCoreRowModel
} from '@tanstack/react-table';

import type { SkillChartResult } from './skill-chart-types';
import { calculateSkillCost, isPurpleSkill, umaForUniqueSkill } from './skill-chart-utils';
import skillnames from '../skillnames.json';
import skillmeta from '../../skill_meta.json';
import umas from '../../umas.json';
import icons from '../../icons.json';

interface SkillChartPaneProps {
	data: SkillChartResult[];
	courseDistance: number;
	hints: Map<string, number>;
	hasSkills: Map<string, string>;
	updateHint: (id: string, hint: number) => void;
	onRunTypeChange: (type: string) => void;
	onSelectionChange: (skillId: string) => void;
	onInfoClick: (skillId: string) => void;
	onDblClickRow: (skillId: string) => void;
	expandedContent?: (skillId: string, runData: any, courseDistance: number, sampleCount?: number) => any;
	showUmaIcons: boolean;
	hideOwned: boolean;
	hidePurple: boolean;
	dirty?: boolean;
}

/**
 * Format bashin value for display
 */
function formatBasinn(info: any) {
	return info.getValue().toFixed(2).replace('-0.00', '0.00') + ' L';
}

/**
 * Skill name cell with icon
 */
function SkillNameCell(props: { id: string; showUmaIcons: boolean }) {
	const { id, showUmaIcons } = props;

	// Debug: log if id is missing
	if (!id) {
		console.warn('[SkillNameCell] Missing skill id');
		return <div class="v2-skill-chart-skill-name"><span>???</span></div>;
	}

	// skillnames values are arrays like ["Name"], access [0]
	const name = skillnames[id]?.[0] || id;

	if (showUmaIcons) {
		const umaId = umaForUniqueSkill(id);
		if (umaId && icons[umaId]) {
			return (
				<div class="v2-skill-chart-skill-name">
					<img src={icons[umaId]} alt="" />
					<span>{name}</span>
				</div>
			);
		}
	}

	return (
		<div class="v2-skill-chart-skill-name">
			<img src={`/uma-tools/icons/${skillmeta[id]?.iconId || 'skill_empty'}.png`} alt="" />
			<span>{name}</span>
		</div>
	);
}

/**
 * SP Cost cell with hint adjustment buttons
 */
function SkillCostCell(props: {
	id: string;
	hint: number;
	hints: Map<string, number>;
	ownedSkills: Map<string, string>;
	updateHint: (id: string, hint: number) => void;
}) {
	const { id, hint, hints, ownedSkills, updateHint } = props;
	const cost = calculateSkillCost(id, hints, ownedSkills);

	return (
		<Fragment>
			<button
				class={`v2-hint-btn v2-hint-down${hint === 0 ? ' disabled' : ''}`}
				disabled={hint === 0}
				onClick={() => updateHint(id, hint - 1)}
				type="button"
			>
				<div class="v2-hint-btn-bg"></div>
				<span class="v2-hint-btn-text">−</span>
			</button>
			<span class="v2-hinted-cost">{cost}</span>
			<button
				class={`v2-hint-btn v2-hint-up${hint === 5 ? ' disabled' : ''}`}
				disabled={hint === 5}
				onClick={() => updateHint(id, hint + 1)}
				type="button"
			>
				<div class="v2-hint-btn-bg"></div>
				<span class="v2-hint-btn-text">+</span>
			</button>
			{hint > 0 && <span class="v2-hint-level">{hint}</span>}
		</Fragment>
	);
}

/**
 * Render sortable header with radio button for run type selection
 */
function headerRenderer(
	radioGroup: string,
	selectedType: string,
	type: string,
	text: string,
	onClick: (type: string) => void
) {
	function click(e: Event) {
		e.stopPropagation();
		onClick(type);
	}
	return (c: any) => (
		<div class="v2-skill-chart-header">
			<input
				type="radio"
				name={radioGroup}
				checked={selectedType === type}
				title={`Show ${text.toLowerCase()} on chart`}
				onClick={click}
			/>
			<span onClick={c.header.column.getToggleSortingHandler()}>{text}</span>
		</div>
	);
}

/**
 * Main Skill Chart Table Component
 */
export function SkillChartPane(props: SkillChartPaneProps) {
	const radioGroup = useId();
	const [selectedType, setSelectedType] = useState('median');

	function headerClick(type: string) {
		setSelectedType(type);
		props.onRunTypeChange(type + 'run');
	}

	// Filter data based on hideOwned and hidePurple
	const filteredData = useMemo(() => {
		let data = props.data;

		if (props.hideOwned) {
			data = data.filter(row => {
				const groupId = skillmeta[row.id]?.groupId;
				if (!groupId) return true;
				return !props.hasSkills.has(groupId);
			});
		}

		if (props.hidePurple) {
			data = data.filter(row => !isPurpleSkill(row.id));
		}

		return data;
	}, [props.data, props.hideOwned, props.hidePurple, props.hasSkills]);

	const columns: ColumnDef<SkillChartResult, any>[] = useMemo(() => [{
		header: () => <span>Skill name</span>,
		accessorKey: 'id',
		cell: (info) => <SkillNameCell id={info.getValue()} showUmaIcons={props.showUmaIcons} />,
		sortingFn: (a, b, _) => {
			const nameA = skillnames[a.getValue('id')] || '';
			const nameB = skillnames[b.getValue('id')] || '';
			return nameA < nameB ? -1 : 1;
		}
	}, {
		header: headerRenderer(radioGroup, selectedType, 'min', 'Minimum', headerClick),
		accessorKey: 'min',
		cell: formatBasinn
	}, {
		header: headerRenderer(radioGroup, selectedType, 'max', 'Maximum', headerClick),
		accessorKey: 'max',
		cell: formatBasinn,
		sortDescFirst: true
	}, {
		header: headerRenderer(radioGroup, selectedType, 'mean', 'Mean', headerClick),
		accessorKey: 'mean',
		cell: formatBasinn,
		sortDescFirst: true
	}, {
		header: headerRenderer(radioGroup, selectedType, 'median', 'Median', headerClick),
		accessorKey: 'median',
		cell: formatBasinn,
		sortDescFirst: true
	}, {
		header: (c) => <span onClick={c.header.column.getToggleSortingHandler()}>SP Cost</span>,
		id: 'spcost',
		accessorFn: (row) => ({ id: row.id, hint: props.hints.get(row.id) || 0 }),
		cell: (info) => (
			<SkillCostCell
				{...info.getValue()}
				hints={props.hints}
				ownedSkills={props.hasSkills}
				updateHint={props.updateHint}
			/>
		),
		sortingFn: (a, b) => {
			const ac = calculateSkillCost(a.getValue('id'), props.hints, props.hasSkills);
			const bc = calculateSkillCost(b.getValue('id'), props.hints, props.hasSkills);
			return +(bc < ac) - +(ac < bc);
		},
		sortDescFirst: false
	}, {
		header: (c) => <span onClick={c.header.column.getToggleSortingHandler()}>L / SP</span>,
		id: 'bsp',
		accessorFn: (row) => row.mean / calculateSkillCost(row.id, props.hints, props.hasSkills),
		cell: (info) => {
			const x = info.getValue();
			return <span>{Number.isFinite(x) ? x.toFixed(6) : '--'}</span>;
		},
		sortingFn: (a, b) => {
			const x = a.getValue('bsp');
			const y = b.getValue('bsp');
			const xf = Number.isFinite(x);
			const yf = Number.isFinite(y);
			return xf && yf ? +(y < x) - +(x < y) : +xf - +yf;
		},
		sortDescFirst: true
	}], [selectedType, props.showUmaIcons, props.hints, props.hasSkills, radioGroup]);

	const [sorting, setSorting] = useState<SortingState>([{ id: 'median', desc: true }]);

	const table = useReactTable({
		columns,
		data: filteredData,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		enableSortingRemoval: false,
		state: { sorting }
	});

	function handleClick(e: MouseEvent) {
		const tr = (e.target as HTMLElement).closest('tr');
		if (tr == null) return;
		e.stopPropagation();

		const id = tr.dataset.skillid;
		if (!id) return;

		if ((e.target as HTMLElement).tagName === 'IMG') {
			props.onInfoClick(id);
			return;
		}

		// Single click: update track visualization
		props.onSelectionChange(id);
	}

	function handleDblClick(e: MouseEvent) {
		const tr = (e.target as HTMLElement).closest('tr');
		if (tr == null) return;
		e.stopPropagation();
		e.preventDefault();

		const id = tr.dataset.skillid;
		if (!id) return;

		if ((e.target as HTMLElement).tagName === 'IMG') {
			return;
		}

		// Double click: add skill to uma
		props.onDblClickRow(id);
	}

	return (
		<div class={`v2-skill-chart-wrapper${props.dirty ? ' dirty' : ''}`}>
			<table class="v2-skill-chart-table">
				<thead>
					{table.getHeaderGroups().map(headerGroup => (
						<tr key={headerGroup.id}>
							{headerGroup.headers.map(header => (
								<th key={header.id} colSpan={header.colSpan}>
									{!header.isPlaceholder && (
										<div
											class={`v2-column-header ${({
												'asc': 'sorted-asc',
												'desc': 'sorted-desc',
												'false': ''
											})[header.column.getIsSorted() as string]}`}
											title={header.column.getCanSort() ? ({
												'asc': 'Sort ascending',
												'desc': 'Sort descending',
												'false': 'Clear sort'
											})[header.column.getNextSortingOrder() as string] : ''}
										>
											{flexRender(header.column.columnDef.header, header.getContext())}
										</div>
									)}
								</th>
							))}
						</tr>
					))}
				</thead>
				<tbody onClick={handleClick} onDblClick={handleDblClick}>
					{table.getRowModel().rows.map(row => {
						const id = row.getValue('id') as string;

						return (
							<tr key={row.id} data-skillid={id}>
								{row.getAllCells().map(cell => (
									<td key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
