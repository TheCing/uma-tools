/**
 * Format-preserving JSON IO for the committed data files. Each file keeps whatever
 * shape it already has on disk (tab / 2-space / minified, trailing newline or not), so
 * a regenerated file only diffs where the data changed. Bytes are written as-is: never
 * let a text writer normalise line endings.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function detectFormat(text) {
	const m = text.match(/^[\[{]\r?\n([ \t]+)/);
	return {indent: m ? m[1] : null, trailingNewline: text.endsWith('\n')};
}

export function serialize(data, format) {
	const body = format.indent ? JSON.stringify(data, null, format.indent) : JSON.stringify(data);
	return body + (format.trailingNewline ? '\n' : '');
}

/** @returns {{data: any, text: string|null, format: {indent: string|null, trailingNewline: boolean}}} */
export function readJsonFile(path, fallbackFormat = {indent: '\t', trailingNewline: true}) {
	if (!existsSync(path)) return {data: undefined, text: null, format: fallbackFormat};
	const text = readFileSync(path, 'utf8');
	return {data: JSON.parse(text), text, format: detectFormat(text)};
}

/** Writes only when the bytes differ. Returns true if the file changed (or would). */
export function writeJsonFile(path, data, format, {dryRun = false} = {}) {
	const next = serialize(data, format);
	const prev = existsSync(path) ? readFileSync(path, 'utf8') : null;
	if (prev === next) return false;
	if (!dryRun) writeFileSync(path, Buffer.from(next, 'utf8'));
	return true;
}
