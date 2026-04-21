import { defineConfig, Plugin } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';
import fs from 'fs';

const projectRoot = path.resolve(__dirname, '..');

function serveDevIndex(): Plugin {
	return {
		name: 'serve-dev-index',
		enforce: 'pre',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (req.url === '/' || req.url === '/index.html') {
					const indexPath = path.join(__dirname, 'index.dev.html');
					if (fs.existsSync(indexPath)) {
						let html = fs.readFileSync(indexPath, 'utf-8');
						html = await server.transformIndexHtml(req.url, html);
						res.setHeader('Content-Type', 'text/html');
						res.end(html);
						return;
					}
				}
				next();
			});
		}
	};
}

function serveUmaToolsAssets(): Plugin {
	return {
		name: 'serve-uma-tools-assets',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (req.url?.startsWith('/uma-tools/')) {
					const filePath = path.join(projectRoot, req.url.replace('/uma-tools/', ''));
					if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
						const ext = path.extname(filePath).toLowerCase();
						const mimeTypes: Record<string, string> = {
							'.png': 'image/png',
							'.jpg': 'image/jpeg',
							'.svg': 'image/svg+xml',
							'.webp': 'image/webp',
							'.woff2': 'font/woff2',
							'.css': 'text/css',
							'.js': 'application/javascript',
							'.json': 'application/json',
						};
						res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
						fs.createReadStream(filePath).pipe(res);
						return;
					}
				}
				next();
			});
		}
	};
}

export default defineConfig(({ mode }) => ({
	plugins: [serveDevIndex(), preact(), serveUmaToolsAssets()],
	base: mode === 'production' ? '/release-timeline/' : '/',
	server: {
		port: 5178,
		fs: { allow: [projectRoot] }
	},
	define: {
		CC_DEBUG: mode === 'development' ? 'true' : 'false',
		CC_GLOBAL: 'true',
	},
	optimizeDeps: {
		include: ['preact', 'preact/hooks'],
	},
	build: {
		outDir: 'dist',
		sourcemap: mode === 'development',
		rollupOptions: {
			input: 'index.dev.html',
			output: {
				entryFileNames: 'bundle.js',
				chunkFileNames: '[name].js',
				assetFileNames: (assetInfo) => {
					if (assetInfo.name?.endsWith('.css')) return 'bundle.css';
					return 'assets/[name][extname]';
				},
			},
		},
	}
}));
