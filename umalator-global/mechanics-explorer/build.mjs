import * as esbuild from 'esbuild';
import * as path from 'node:path';
import * as http from 'node:http';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { program } from 'commander';

program
	.option('--debug')
	.option('--serve [port]');

program.parse();
const options = program.opts();
const debug = !!options.debug;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const globalDir = path.join(dirname, '..');   // umalator-global
const rootDir = path.join(globalDir, '..');   // repo root

// Alias uma-skill-tools/data/* imports (and skill_meta/umas) to the Global data files.
const redirectData = {
	name: 'redirectData',
	setup(build) {
		build.onResolve({filter: /^(?:\.\.\/)*(?:uma-skill-tools\/)?data\//}, args => ({
			path: path.join(globalDir, args.path.split('/data/')[1])
		}));
		build.onResolve({filter: /skill_meta.json$/}, () => ({
			path: path.join(globalDir, 'skill_meta.json')
		}));
		build.onResolve({filter: /umas.json$/}, () => ({
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

const buildOptions = {
	entryPoints: [{in: './app.tsx', out: 'bundle'}],
	bundle: true,
	minify: !debug,
	outdir: '.',
	define: {CC_DEBUG: debug.toString(), CC_GLOBAL: 'true', CC_DEV: 'false'},
	alias: {'react': 'preact/compat', 'react-dom': 'preact/compat'},
	external: ['*.ttf'],
	plugins: [redirectData, mockAssert]
};

if (options.serve) {
	const port = typeof options.serve === 'string' ? +options.serve : 8000;
	const ctx = await esbuild.context(buildOptions);
	await ctx.watch();

	const mime = {
		'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
		'.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
		'.woff2': 'font/woff2', '.ttf': 'font/ttf', '.webp': 'image/webp',
		'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
	};

	http.createServer((req, res) => {
		const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
		if (urlPath.includes('..')) { res.writeHead(404); res.end('Not found'); return; }

		// /uma-tools/* maps to the repo root (matches the production _redirects rewrite,
		// where shared icons/fonts/data live). Everything else is an app-relative request,
		// served from this app's own directory so the app works at both `/` and
		// `/mechanics-explorer/` (relative bundle.js/bundle.css resolve correctly either way).
		let filePath;
		if (urlPath.startsWith('/uma-tools/')) {
			filePath = path.join(rootDir, urlPath.slice('/uma-tools'.length));
		} else {
			let p = urlPath;
			if (p === '/' || p === '/mechanics-explorer' || p === '/mechanics-explorer/') {
				p = '/index.html';
			} else if (p.startsWith('/mechanics-explorer/')) {
				p = '/' + p.slice('/mechanics-explorer/'.length);
			}
			filePath = path.join(dirname, p);
		}
		fs.readFile(filePath, (err, data) => {
			if (err) { res.writeHead(404); res.end('Not found: ' + urlPath); return; }
			res.writeHead(200, {'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream'});
			res.end(data);
		});
	}).listen(port, () => {
		console.log(`Mechanics Explorer dev server: http://localhost:${port}/mechanics-explorer/`);
	});
} else {
	await esbuild.build(buildOptions);
	console.log('Built mechanics-explorer');
}
