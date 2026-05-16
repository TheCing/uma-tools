#!/usr/bin/env node
/**
 * Build script for Release Timeline
 *
 * Usage:
 *   node build.mjs          # Production build
 *   node build.mjs --serve  # Dev server
 */

import { execSync, spawn } from 'child_process';
import { cpSync, existsSync, rmSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');
const prodIndex = join(__dirname, 'index.html');
const prodIndexBackup = join(__dirname, 'index.html.prod');

const args = process.argv.slice(2);
const serve = args.includes('--serve');

if (serve) {
	if (existsSync(prodIndex)) {
		renameSync(prodIndex, prodIndexBackup);
		console.log('Moved index.html -> index.html.prod for dev server');
	}

	const cleanup = () => {
		if (existsSync(prodIndexBackup)) {
			renameSync(prodIndexBackup, prodIndex);
			console.log('\nRestored index.html.prod -> index.html');
		}
	};
	process.on('SIGINT', () => { cleanup(); process.exit(); });
	process.on('SIGTERM', () => { cleanup(); process.exit(); });

	const vite = spawn('../node_modules/.bin/vite', [], { stdio: 'inherit', cwd: __dirname, shell: true });
	vite.on('close', cleanup);
} else {
	console.log('Building Release Timeline...');

	if (existsSync(join(__dirname, 'bundle.js'))) rmSync(join(__dirname, 'bundle.js'));
	if (existsSync(join(__dirname, 'bundle.css'))) rmSync(join(__dirname, 'bundle.css'));
	if (existsSync(prodIndex)) rmSync(prodIndex);
	if (existsSync(prodIndexBackup)) rmSync(prodIndexBackup);
	if (existsSync(join(__dirname, 'assets'))) rmSync(join(__dirname, 'assets'), { recursive: true });

	execSync('../node_modules/.bin/vite build', { stdio: 'inherit', cwd: __dirname });

	console.log('Copying build output...');
	const htmlContent = readFileSync(join(distDir, 'index.dev.html'), 'utf-8');
	writeFileSync(prodIndex, htmlContent);
	cpSync(join(distDir, 'bundle.js'), join(__dirname, 'bundle.js'));
	cpSync(join(distDir, 'bundle.css'), join(__dirname, 'bundle.css'));
	const assetsDir = join(distDir, 'assets');
	if (existsSync(assetsDir)) {
		cpSync(assetsDir, join(__dirname, 'assets'), { recursive: true });
	}
	rmSync(distDir, { recursive: true });

	console.log('Build complete!');
}
