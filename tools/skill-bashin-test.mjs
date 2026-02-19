#!/usr/bin/env node
/**
 * Quick skill bashin test using the umalator comparison logic
 * Tests key CM8 accel skills against a Taishin base
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

// Skills to test
const SKILLS_TO_TEST = [
  { id: '900271', name: "Let's Pump Some Iron! (inherited)" },
  { id: '900591', name: 'Moving Past, and Beyond (inherited)' },
  { id: '200491', name: 'No Stopping Me!' },
  { id: '200492', name: 'Nimble Navigator' },
  { id: '200641', name: 'Encroaching Shadow' },
  { id: '200642', name: 'Straightaway Spurt' },
  { id: '210032', name: 'Ignited Spirit PWR' },
  { id: '210031', name: 'Burning Spirit PWR' },
];

// Load the base uma config
const baseUma = JSON.parse(fs.readFileSync('temp/taishin_test.json', 'utf8'));

console.log('Base Uma: Taishin-style Oikomi');
console.log(`Stats: ${baseUma.speed}/${baseUma.stamina}/${baseUma.power}/${baseUma.guts}/${baseUma.wisdom}`);
console.log('Course: CM8 Nakayama 2500m (10506)');
console.log('');
console.log('Note: This script outlines the test setup.');
console.log('For actual bashin values, use the skill chart in umalator-global:');
console.log('  1. cd umalator-global && node build.mjs --serve');
console.log('  2. Open http://localhost:8000/umalator-global/');
console.log('  3. Set course to Nakayama 2500m Inner');
console.log('  4. Import the test uma');
console.log('  5. Use Skill Chart mode to measure each skill');
console.log('');
console.log('Skills to test:');
SKILLS_TO_TEST.forEach((s, i) => {
  console.log(`  ${i+1}. ${s.name} (${s.id})`);
});
