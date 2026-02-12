/**
 * Preact Table Adapter
 *
 * Re-exports @tanstack/react-table for use with Preact.
 * Preact's React compatibility handles the rest.
 */

export {
	// Core
	useReactTable,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	createColumnHelper,

	// Types
	type ColumnDef,
	type SortingState,
	type Row,
	type Table,
	type Header,
	type HeaderGroup,
	type Cell,

	// Sorting
	sortingFns,
} from '@tanstack/react-table';

// Alias for Preact naming convention
export { useReactTable as useTable } from '@tanstack/react-table';
