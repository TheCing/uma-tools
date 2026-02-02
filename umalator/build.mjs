import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { fileURLToPath } from 'node:url';

import { program, Option } from 'commander';

program
	.option('--debug')
	.addOption(new Option('--serve [port]', 'run development server on [port]').preset(8000).implies({debug: true}));

program.parse();
const options = program.opts();
const port = options.serve;
const serve = port != null;
const debug = !!options.debug;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dirname, '..');

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

const buildOptions = {
	entryPoints: [{in: './app.tsx', out: 'bundle'}, './simulator.worker.ts'],
	bundle: true,
	minify: !debug,
	outdir: '.',
	write: !serve,
	define: {CC_DEBUG: debug.toString(), CC_GLOBAL: 'false'},
	external: ['*.ttf'],
	plugins: [mockAssert, redirectTable]
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

const ARTIFACTS = ['bundle.js', 'bundle.css', 'simulator.worker.js'];

function runServer(ctx, port) {
	const requestCount = new Map(ARTIFACTS.map(f => [f, 0]));
	let buildCount = 0;
	let output = null;
	// client makes two requests for simulator.worker.js, avoid rebuilding on the second one
	let workerState = 0;
	http.createServer(async (req, res) => {
		// Redirect directory URLs without trailing slash
		if (!req.url.endsWith('/') && !path.extname(req.url)) {
			const checkPath = path.join(root, req.url.slice(1));
			try {
				const stat = await fs.promises.stat(checkPath);
				if (stat.isDirectory()) {
					console.log(`GET ${req.url} 301 Redirect -> ${req.url}/`);
					res.writeHead(301, {'Location': req.url + '/'}).end();
					return;
				}
			} catch {}
		}
		let url = req.url.endsWith('/') ? req.url + 'index.html' : req.url;
		// Strip leading slash for path.join to work correctly
		if (url.startsWith('/')) url = url.slice(1);
		// Strip /uma-tools/ prefix if present (for local dev - assets are at root)
		if (url.startsWith('uma-tools/')) url = url.slice('uma-tools/'.length);
		// Strip umalator/ prefix for artifact matching
		let artifactKey = url;
		if (artifactKey.startsWith('umalator/')) artifactKey = artifactKey.slice('umalator/'.length);
		const filename = path.basename(url);
		if (ARTIFACTS.indexOf(artifactKey) > -1) {
			const requestN = requestCount.get(artifactKey) + (artifactKey == 'simulator.worker.js' ? (workerState = +!workerState) : 1);
			requestCount.set(artifactKey, requestN);
			if (requestN != buildCount) {
				buildCount += 1;
				console.log(`rebuilding ... => ${buildCount}`);
				output = new Promise(async resolve => {
					const result = await ctx.rebuild();
					resolve(new Map(result.outputFiles.map(o => [path.basename(o.path), o.contents])));
				});
			}
			console.log(`GET ${req.url} 200 OK => ${requestN}`);
			const artifact = (await output).get(artifactKey);
			res.writeHead(200, {
				'Content-type': MIME_TYPES[path.extname(filename)],
				'Content-length': artifact.length
			}).end(artifact);
		} else {
			const fp = path.join(root, url);
			const exists = await fs.promises.access(fp).then(() => true, () => false);
			if (exists) {
				const stat = await fs.promises.stat(fp);
				if (stat.isDirectory()) {
					// Try index.html in directory
					const indexPath = path.join(fp, 'index.html');
					const indexExists = await fs.promises.access(indexPath).then(() => true, () => false);
					if (indexExists) {
						console.log(`GET ${req.url} 200 OK`);
						res.writeHead(200, {'Content-type': 'text/html; charset=UTF-8'});
						fs.createReadStream(indexPath).pipe(res);
					} else {
						console.log(`GET ${req.url} 404 Not Found`);
						res.writeHead(404).end();
					}
				} else {
					console.log(`GET ${req.url} 200 OK`);
					res.writeHead(200, {'Content-type': MIME_TYPES[path.extname(filename)] || 'application/octet-stream'});
					fs.createReadStream(fp).pipe(res);
				}
			} else {
				console.log(`GET ${req.url} 404 Not Found`)
				res.writeHead(404).end();
			}
		}
	}).listen(port);
}

if (serve) {
	const ctx = await esbuild.context(buildOptions);
	runServer(ctx, port);
	console.log(`Serving on http://[::]:${port}/ ...`);
	console.log(`  JP: http://localhost:${port}/umalator/`);
} else {
	await esbuild.build(buildOptions);
}
