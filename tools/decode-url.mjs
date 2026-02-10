#!/usr/bin/env node
/**
 * Decode a umalator share URL hash and output the state as JSON
 * Usage: node decode-url.mjs "HASH_STRING"
 */

import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const gunzipAsync = promisify(gunzip);

async function decodeHash(hash) {
	// URL decode and base64 decode
	const decoded = decodeURIComponent(hash);
	const binary = Buffer.from(decoded, 'base64');

	// Gunzip
	const decompressed = await gunzipAsync(binary);
	const jsonStr = decompressed.toString('utf8');

	return JSON.parse(jsonStr);
}

const hash = process.argv[2];
if (!hash) {
	console.error('Usage: node decode-url.mjs "HASH_STRING"');
	console.error('  You can also pass a full URL - the hash will be extracted');
	process.exit(1);
}

// Extract hash from URL if full URL provided
let hashPart = hash;
if (hash.includes('#')) {
	hashPart = hash.split('#')[1];
}

try {
	const state = await decodeHash(hashPart);
	console.log(JSON.stringify(state, null, 2));
} catch (error) {
	console.error('Failed to decode:', error.message);
	process.exit(1);
}
