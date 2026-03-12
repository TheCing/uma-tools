import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { program, Option } from 'commander';

program
	.option('--debug')
	.addOption(new Option('--serve [port]', 'run development server on [port]').preset(8000).implies({debug: true}));

program.parse();
const options = program.opts();
const port = options.serve;
const isDev = process.env.CF_PAGES_BRANCH === 'dev' || process.env.CC_DEV === 'true' || port != null;
const serve = port != null;
const debug = !!options.debug;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..');

const redirectData = {
	name: 'redirectData',
	setup(build) {
		build.onResolve({filter: /^\.\.?(?:\/uma-skill-tools)?\/data\//}, args => ({
			path: path.join(dirname, args.path.split('/data/')[1])
		}));
		build.onResolve({filter: /skill_meta.json$/}, args => ({
			path: path.join(dirname, 'skill_meta.json')
		}));
		build.onResolve({filter: /umas.json$/}, args => ({
			path: path.join(dirname, 'umas.json')
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

const redirectTable = {
	name: 'redirectTable',
	setup(build) {
		build.onResolve({filter: /^@tanstack\//}, args => ({
			path: path.join(dirname, '..', 'vendor', args.path.slice(10), 'index.ts')
		}));
	}
};

const seedrandomPlugin = {
	name: 'seedrandomPlugin',
	setup(build) {
		build.onResolve({filter: /^seedrandom$/}, args => ({
			path: args.path,
			namespace: 'seedrandom-ns'
		}));
		build.onLoad({filter: /.*/, namespace: 'seedrandom-ns'}, () => ({
			contents: `
// Simple seedrandom implementation for browser
export default function seedrandom(seed) {
	let x = 0;
	let y = 0;
	let z = 0;
	let w = 0;

	function next() {
		const t = x ^ (x << 11);
		x = y;
		y = z;
		z = w;
		w = w ^ (w >>> 19) ^ (t ^ (t >>> 8));
		return (w >>> 0) / 0x100000000;
	}

	// Simple seed initialization
	const str = seed.toString();
	for (let i = 0; i < str.length; i++) {
		x = (x * 31 + str.charCodeAt(i)) >>> 0;
	}

	return next;
}
			`,
			loader: 'js'
		}));
	}
};

// Generate not-in-game.json by diffing local data against kachi-dev/master
function generateNotInGame() {
	const outPath = path.join(dirname, 'not-in-game.json');
	try {
		const kachiSkillRaw = execSync('git show kachi-dev/master:umalator-global/skill_data.json', { cwd: root, encoding: 'utf-8' });
		const kachiUmaRaw = execSync('git show kachi-dev/master:umalator-global/umas.json', { cwd: root, encoding: 'utf-8' });
		const kachiSkills = new Set(Object.keys(JSON.parse(kachiSkillRaw)));
		const kachiUmas = JSON.parse(kachiUmaRaw);
		const kachiOutfits = new Set(
			Object.keys(kachiUmas).flatMap(id => Object.keys(kachiUmas[id].outfits || {}))
		);

		const localSkills = JSON.parse(fs.readFileSync(path.join(dirname, 'skill_data.json'), 'utf-8'));
		const localUmas = JSON.parse(fs.readFileSync(path.join(dirname, 'umas.json'), 'utf-8'));
		const localOutfits = Object.keys(localUmas).flatMap(id => Object.keys(localUmas[id].outfits || {}));

		const result = {
			skills: Object.keys(localSkills).filter(id => !kachiSkills.has(id)),
			outfits: localOutfits.filter(id => !kachiOutfits.has(id))
		};

		fs.writeFileSync(outPath, JSON.stringify(result));
		console.log(`not-in-game.json: ${result.skills.length} skills, ${result.outfits.length} outfits`);
	} catch (e) {
		console.warn('Could not generate not-in-game.json (kachi-dev remote unavailable), using empty list');
		fs.writeFileSync(outPath, JSON.stringify({ skills: [], outfits: [] }));
	}
}

generateNotInGame();

const buildOptions = {
	entryPoints: [{in: '../umalator/app.tsx', out: 'bundle'}, '../umalator/simulator.worker.ts'],
	bundle: true,
	minify: !debug,
	outdir: '.',
	write: !serve,
	define: {CC_DEBUG: debug.toString(), CC_GLOBAL: 'true', CC_DEV: isDev.toString(), CC_OCR_PROXY: JSON.stringify(process.env.OCR_PROXY_URL || '')},
	external: ['*.ttf'],
	plugins: [redirectData, mockAssert, redirectTable, seedrandomPlugin],
};

// v2 experimental build options
// Note: v2 uses npm @tanstack/react-table directly (v8 API), not the vendor files (v9 alpha API)
// Note: v2 production uses Vite (see build-all.sh), this is for dev server only
const buildOptionsV2 = {
	entryPoints: [{in: './v2/app-v2.tsx', out: 'v2/bundle-v2'}],
	bundle: true,
	minify: !debug,
	outdir: '.',
	write: !serve,
	define: {CC_DEBUG: debug.toString(), CC_GLOBAL: 'true', CC_DEV: isDev.toString(), CC_OCR_PROXY: JSON.stringify(process.env.OCR_PROXY_URL || '')},
	external: ['*.ttf'],
	plugins: [redirectData, mockAssert, seedrandomPlugin],  // No redirectTable - use npm packages
};

const MIME_TYPES = {
	'.html': 'text/html; charset=UTF-8',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.otf': 'font/otf',
	'.ttf': 'font/ttf',
	'.woff': 'font/woff'
};

const ARTIFACTS = ['bundle.js', 'bundle.css', 'simulator.worker.js', 'bundle-v2.js', 'bundle-v2.css'];

function runServer(ctx, port) {
	const requestCount = new Map(ARTIFACTS.map(f => [f, 0]));
	let buildCount = 0;
	let output = null;
	// client makes two requests for simulator.worker.js, avoid rebuilding on the second one
	let workerState = 0;
	http.createServer(async (req, res) => {
		let url = req.url.endsWith('/') ? req.url + 'index.html' : req.url;
		// Strip leading slash for path.join to work correctly
		if (url.startsWith('/')) url = url.slice(1);
		// Strip /uma-tools/ prefix if present (for local dev - assets are at root)
		if (url.startsWith('uma-tools/')) url = url.slice('uma-tools/'.length);
		// Strip umalator-global/ prefix for artifact matching
		let artifactKey = url;
		if (artifactKey.startsWith('umalator-global/')) artifactKey = artifactKey.slice('umalator-global/'.length);
		const filename = path.basename(url);
		// Skill-visualizer has its own pre-built bundles on disk — skip artifact matching
		const isSkillVis = artifactKey.startsWith('skill-visualizer/');
		// Check if this is a v2 artifact or main artifact
		const isV2Artifact = artifactKey.startsWith('v2/') && ARTIFACTS.some(a => artifactKey.endsWith(a.replace('bundle-v2', 'bundle-v2')));
		const artifactName = isV2Artifact ? path.basename(artifactKey) : filename;
		if (!isSkillVis && ARTIFACTS.indexOf(artifactName) > -1) {
			const requestN = requestCount.get(artifactName) + (artifactName == 'simulator.worker.js' ? (workerState = +!workerState) : 1);
			requestCount.set(artifactName, requestN);
			if (requestN != buildCount) {
				buildCount += 1;
				console.log(`rebuilding ... => ${buildCount}`);
				// NOTE: i feel like we should call ctx.cancel() here in case the previous build is running,
				// but doing so causes the rebuild to not pick up new changes for some reason? slightly confused,
				// perhaps using the API wrong
				//await ctx.cancel();
				output = new Promise(async resolve => {
					const result = await ctx.rebuild();
					resolve(new Map(result.outputFiles.map(o => [path.basename(o.path), o.contents])));
				});
			}
			console.log(`GET ${req.url} 200 OK => ${requestN}`);
			const artifact = (await output).get(artifactName);
			res.writeHead(200, {
				'Content-type': MIME_TYPES[path.extname(filename)],
				'Content-length': artifact.length
			}).end(artifact);
		} else {
			const fp = path.join(root, url);
			const exists = await fs.promises.access(fp).then(() => true, () => false);
			if (exists) {
				console.log(`GET ${req.url} 200 OK`);
				res.writeHead(200, {'Content-type': MIME_TYPES[path.extname(filename)] || 'application/octet-stream'});
				fs.createReadStream(fp).pipe(res);
			} else {
				console.log(`GET ${req.url} 404 Not Found`)
				res.writeHead(404).end();
			}
		}
	}).listen(port);
}

if (serve) {
	// Build both main and v2 in serve mode
	const ctx = await esbuild.context(buildOptions);
	const ctxV2 = await esbuild.context(buildOptionsV2);

	// Combine contexts for rebuilding
	const combinedCtx = {
		async rebuild() {
			const [result1, result2] = await Promise.all([ctx.rebuild(), ctxV2.rebuild()]);
			return {
				outputFiles: [...result1.outputFiles, ...result2.outputFiles]
			};
		}
	};

	runServer(combinedCtx, port);
	console.log(`Serving on http://[::]:${port}/ ...`);
	console.log(`  v1: http://localhost:${port}/umalator-global/`);
	console.log(`  v2: use Vite — cd v2 && npm run dev`);
} else {
	await Promise.all([
		esbuild.build(buildOptions),
		esbuild.build(buildOptionsV2)
	]);
}
