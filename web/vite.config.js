/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import react from '@vitejs/plugin-react';
import { defineConfig, transformWithEsbuild } from 'vite';
import pkg from '@douyinfe/vite-plugin-semi';
import path from 'path';
import { codeInspectorPlugin } from 'code-inspector-plugin';
const { vitePluginSemi } = pkg;
const DEFAULT_PROXY_TARGET = 'https://nbility.dev';
const proxyTarget =
  process.env.BACKEND_ORIGIN ||
  process.env.VITE_REACT_APP_BACKEND_ORIGIN ||
  process.env.VITE_REACT_APP_SERVER_URL ||
  DEFAULT_PROXY_TARGET;

function createManualChunk(id) {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (
    id.includes('/react/') ||
    id.includes('/react-dom/') ||
    id.includes('/react-router-dom/')
  ) {
    return 'react-core';
  }

  if (id.includes('@douyinfe/semi-icons')) {
    return 'semi-icons';
  }

  if (id.includes('@douyinfe/semi-illustrations')) {
    return 'semi-illustrations';
  }

  if (
    id.includes('/axios/') ||
    id.includes('/history/') ||
    id.includes('/sse.js/') ||
    id.includes('/marked/')
  ) {
    return 'tools';
  }

  if (id.includes('@douyinfe/semi-ui')) {
    return 'semi-ui';
  }

  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    command === 'serve'
      ? codeInspectorPlugin({
          bundler: 'vite',
        })
      : null,
    {
      name: 'treat-js-files-as-jsx',
      async transform(code, id) {
        if (!/src\/.*\.js$/.test(id)) {
          return null;
        }

        return transformWithEsbuild(code, id, {
          loader: 'jsx',
          jsx: 'automatic',
        });
      },
    },
    react(),
    vitePluginSemi({
      cssLayer: true,
    }),
  ].filter(Boolean),
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
        '.json': 'json',
      },
    },
  },
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: createManualChunk,
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/v1': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/v1beta': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/mj': {
        target: proxyTarget,
        changeOrigin: true,
      },
      '/pg': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
}));
