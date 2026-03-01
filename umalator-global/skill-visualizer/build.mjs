import * as esbuild from 'esbuild';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { program } from 'commander';

program
	.option('--debug');

program.parse();
const options = program.opts();
const debug = !!options.debug;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const globalDir = path.join(dirname, '..');

const redirectData = {
	name: 'redirectData',
	setup(build) {
		build.onResolve({filter: /^(?:\.\.\/)*(?:uma-skill-tools\/)?data\//}, args => ({
			path: path.join(globalDir, args.path.split('/data/')[1])
		}));
		build.onResolve({filter: /skill_meta.json$/}, args => ({
			path: path.join(globalDir, 'skill_meta.json')
		}));
		build.onResolve({filter: /umas.json$/}, args => ({
			path: path.join(globalDir, 'umas.json')
		}));
	}
};

const mockAssertFn = debug ? 'console.assert' : 'function(){}';
const mockAssert = {
	name: 'mockAssert',
	setup(build) {
		build.onResolve({filter: /^node:assert$/}, args => ({
			path: args.path, namespace: 'mockAssert-ns'
		}));
		build.onLoad({filter: /.*/, namespace: 'mockAssert-ns'}, () => ({
			contents: 'module.exports={strict:'+mockAssertFn+'};',
			loader: 'js'
		}));
	}
};

// Build v1 (reuses skill-visualizer/app.tsx source with global data)
await esbuild.build({
	entryPoints: [{in: '../../skill-visualizer/app.tsx', out: 'bundle'}],
	bundle: true,
	minify: !debug,
	outdir: '.',
	define: {CC_DEBUG: debug.toString(), CC_GLOBAL: 'true', CC_DEV: 'false'},
	external: ['*.ttf'],
	plugins: [redirectData, mockAssert]
});

// Build v2
await esbuild.build({
	entryPoints: [{in: './v2/app-v2.tsx', out: 'bundle-v2'}],
	bundle: true,
	minify: !debug,
	outdir: './v2',
	define: {CC_DEBUG: debug.toString(), CC_GLOBAL: 'true', CC_DEV: 'false'},
	alias: {'react': 'preact/compat', 'react-dom': 'preact/compat'},
	external: ['*.ttf'],
	plugins: [redirectData, mockAssert]
});
