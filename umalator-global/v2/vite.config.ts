import { defineConfig, Plugin } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';
import fs from 'fs';

const rootDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(__dirname, '../..');

// Custom plugin to redirect data file imports to Global versions
// This matches esbuild's redirectData plugin behavior
function redirectDataFiles(): Plugin {
  const umaSkillToolsDataDir = path.join(projectRoot, 'uma-skill-tools/data');

  return {
    name: 'redirect-data-files',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;

      // Check if this is a relative import that would resolve to uma-skill-tools/data/
      if (source.startsWith('./') || source.startsWith('../')) {
        const resolvedPath = path.resolve(path.dirname(importer), source);

        // If the resolved path is within uma-skill-tools/data/, redirect to umalator-global/
        if (resolvedPath.startsWith(umaSkillToolsDataDir)) {
          const relativePath = resolvedPath.slice(umaSkillToolsDataDir.length + 1);
          const redirectedPath = path.join(rootDir, relativePath);
          return redirectedPath;
        }
      }

      return null;
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
            // Determine content type
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
  plugins: [redirectDataFiles(), preact(), serveUmaToolsAssets()],

  // Use relative paths for flexible deployment at /v2 or /umalator-global/v2
  // Can be overridden via VITE_BASE env var if needed
  base: process.env.VITE_BASE || './',

  // Dev server config
  server: {
    port: 5173,
    // Serve static files from project root (for icons/, fonts/, etc.)
    fs: {
      allow: [projectRoot]
    }
  },

  resolve: {
    alias: {
      // Data file redirects for relative imports from umalator/
      // The redirectDataFiles() plugin handles imports from within uma-skill-tools/
      '../uma-skill-tools/data': rootDir,
      '../../uma-skill-tools/data': rootDir,
      '../data': rootDir,
      '../../data': rootDir,

      // Specific JSON file redirects
      'skill_meta.json': path.join(rootDir, 'skill_meta.json'),
      'umas.json': path.join(rootDir, 'umas.json'),

      // Node assert mock - point to our local mock
      'node:assert': path.join(__dirname, 'mocks/assert.ts'),
    }
  },

  define: {
    CC_DEBUG: mode === 'development' ? 'true' : 'false',
    CC_GLOBAL: 'true',
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['preact', 'preact/hooks', 'd3', 'immutable'],
  },

  // Static assets in public/ are copied to dist root
  publicDir: 'public',

  build: {
    outDir: 'dist',
    // Generate sourcemaps for debugging
    sourcemap: mode === 'development',
  },

  // Worker configuration
  worker: {
    format: 'es',
    // Apply same plugins to workers
    plugins: () => [redirectDataFiles()],
    rollupOptions: {
      output: {
        entryFileNames: '[name].js'
      }
    }
  }
}));
