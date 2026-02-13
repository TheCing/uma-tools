import { defineConfig, Plugin } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';
import fs from 'fs';

const projectRoot = path.resolve(__dirname, '..');
const umalatorGlobal = path.resolve(__dirname, '../umalator-global');

// Custom plugin to serve index.dev.html as root during development
function serveDevIndex(): Plugin {
  return {
    name: 'serve-dev-index',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Serve index.dev.html for root and /index.html requests
        if (req.url === '/' || req.url === '/index.html') {
          const indexPath = path.join(__dirname, 'index.dev.html');
          if (fs.existsSync(indexPath)) {
            let html = fs.readFileSync(indexPath, 'utf-8');
            // Let Vite transform the HTML (inject HMR client, etc.)
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

// Custom plugin to serve /uma-tools/* from project root
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
              '.jpeg': 'image/jpeg',
              '.gif': 'image/gif',
              '.svg': 'image/svg+xml',
              '.webp': 'image/webp',
              '.woff': 'font/woff',
              '.woff2': 'font/woff2',
              '.ttf': 'font/ttf',
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
  plugins: [preact(), serveDevIndex(), serveUmaToolsAssets()],

  base: mode === 'production' ? '/events/' : '/',

  server: {
    port: 5175,
    fs: {
      allow: [projectRoot]
    }
  },

  resolve: {
    alias: {
      // Data file redirects - use Global version JSON files
      '../uma-skill-tools/data': umalatorGlobal,
      '../../uma-skill-tools/data': umalatorGlobal,
    }
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
