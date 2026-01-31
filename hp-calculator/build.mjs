#!/usr/bin/env node
/**
 * Build script for HP Calculator
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
  // Development server
  // Temporarily hide production index.html if it exists
  if (existsSync(prodIndex)) {
    renameSync(prodIndex, prodIndexBackup);
    console.log('Moved index.html -> index.html.prod for dev server');
  }

  // Handle cleanup on exit
  const cleanup = () => {
    if (existsSync(prodIndexBackup)) {
      renameSync(prodIndexBackup, prodIndex);
      console.log('\\nRestored index.html.prod -> index.html');
    }
  };
  process.on('SIGINT', () => { cleanup(); process.exit(); });
  process.on('SIGTERM', () => { cleanup(); process.exit(); });

  // Start Vite dev server (use local node_modules)
  const vite = spawn('node', ['../node_modules/vite/bin/vite.js'], { stdio: 'inherit', cwd: __dirname });
  vite.on('close', cleanup);
} else {
  // Production build
  console.log('Building HP Calculator...');

  // Clean previous build
  if (existsSync(join(__dirname, 'bundle.js'))) rmSync(join(__dirname, 'bundle.js'));
  if (existsSync(join(__dirname, 'bundle.css'))) rmSync(join(__dirname, 'bundle.css'));
  if (existsSync(prodIndex)) rmSync(prodIndex);
  if (existsSync(prodIndexBackup)) rmSync(prodIndexBackup);
  if (existsSync(join(__dirname, 'assets'))) rmSync(join(__dirname, 'assets'), { recursive: true });

  // Run Vite build (use local node_modules)
  execSync('node ../node_modules/vite/bin/vite.js build', { stdio: 'inherit', cwd: __dirname });

  // Copy dist contents to parent folder
  console.log('Copying build output...');

  // Copy and rename HTML (index.dev.html -> index.html)
  const htmlContent = readFileSync(join(distDir, 'index.dev.html'), 'utf-8');
  writeFileSync(prodIndex, htmlContent);

  // Copy bundle files
  cpSync(join(distDir, 'bundle.js'), join(__dirname, 'bundle.js'));
  cpSync(join(distDir, 'bundle.css'), join(__dirname, 'bundle.css'));

  // Copy assets folder if it exists
  const assetsDir = join(distDir, 'assets');
  if (existsSync(assetsDir)) {
    cpSync(assetsDir, join(__dirname, 'assets'), { recursive: true });
  }

  // Clean up dist folder
  rmSync(distDir, { recursive: true });

  console.log('Build complete!');
  console.log('Production files: index.html, bundle.js, bundle.css');
}
