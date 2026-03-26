import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },

    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },

    optimizeDeps: {
      entries: ['src/main.tsx'],
      include: [
        'react', 'react-dom', 'react-dom/client',
        'motion/react',
        'lucide-react',
        '@google/genai',
        'xterm',
        'xterm-addon-fit',
      ],
      force: false,
    },

    server: {
      host: '0.0.0.0',
      port: 5173,
      hmr: { overlay: false },
      watch: {
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/.git/**',
          '**/*.gguf',
          '**/*.bin',
          '**/*.safetensors',
          '**/models/**',
        ],
        usePolling: false,
        interval: 300,
      },
    },

    build: {
      target: 'es2020',
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('xterm'))        return 'xterm';
              if (id.includes('@google/genai')) return 'google-ai';
              if (id.includes('motion'))        return 'motion';
              if (id.includes('lucide-react'))  return 'icons';
              return 'vendor';
            }
            if (id.includes('OSBuilder'))     return 'page-osbuilder';
            if (id.includes('NexusClaw'))     return 'page-claw';
            if (id.includes('NexusOSINT'))    return 'page-osint';
            if (id.includes('ModelTrainer'))  return 'page-trainer';
            if (id.includes('BusinessHub'))   return 'page-biz';
            if (id.includes('YouTubeCenter')) return 'page-yt';
            if (id.includes('LifeHub'))       return 'page-lifehub';
          },
        },
      },
      chunkSizeWarningLimit: 1000,
      sourcemap: false,
      minify: 'esbuild',
    },

    css: { devSourcemap: false },
    worker: { format: 'es' },
  };
});
