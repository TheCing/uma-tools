#!/usr/bin/env node
// Simple HTTP server for local network development
// Serves umalator-global at /uma-tools/ with proper asset routing

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { networkInterfaces } from 'node:os';

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.dirname(new URL(import.meta.url).pathname);

const MIME_TYPES = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
};

function getMimeType(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

function serveFile(res, filePath) {
	fs.readFile(filePath, (err, data) => {
		if (err) {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not Found');
			return;
		}
		res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
		res.end(data);
	});
}

const server = http.createServer((req, res) => {
	let urlPath = req.url.split('?')[0]; // Remove query string

	// Route /uma-tools/ requests
	if (urlPath === '/uma-tools' || urlPath === '/uma-tools/') {
		serveFile(res, path.join(ROOT_DIR, 'umalator-global', 'index.html'));
		return;
	}

	if (urlPath.startsWith('/uma-tools/')) {
		const subPath = urlPath.slice('/uma-tools/'.length);

		// Check umalator-global directory first (for bundle.js, bundle.css, etc.)
		const globalPath = path.join(ROOT_DIR, 'umalator-global', subPath);
		if (fs.existsSync(globalPath) && fs.statSync(globalPath).isFile()) {
			serveFile(res, globalPath);
			return;
		}

		// Fall back to root directory (for icons, fonts, etc.)
		const rootPath = path.join(ROOT_DIR, subPath);
		if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
			serveFile(res, rootPath);
			return;
		}

		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not Found');
		return;
	}

	// Redirect root to /uma-tools/
	if (urlPath === '/') {
		res.writeHead(302, { 'Location': '/uma-tools/' });
		res.end();
		return;
	}

	res.writeHead(404, { 'Content-Type': 'text/plain' });
	res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`\nUmalator Global server running!\n`);
	console.log(`Local:   http://localhost:${PORT}/uma-tools/`);

	// Get local network IP
	const nets = networkInterfaces();
	for (const name of Object.keys(nets)) {
		for (const net of nets[name]) {
			if (net.family === 'IPv4' && !net.internal) {
				console.log(`Network: http://${net.address}:${PORT}/uma-tools/`);
			}
		}
	}
	console.log(`\nPress Ctrl+C to stop.\n`);
});
