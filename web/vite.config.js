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
    id.includes('/marked/') ||
    id.includes('/sse.js/')
  ) {
    return 'tools';
  }

  if (
    id.includes('/react-markdown/') ||
    id.includes('/remark-') ||
    id.includes('/mdast-') ||
    id.includes('/micromark/') ||
    id.includes('/unist-') ||
    id.includes('/unified/') ||
    id.includes('/vfile/')
  ) {
    return 'markdown-core';
  }

  if (
    id.includes('/rehype-') ||
    id.includes('/hast-') ||
    id.includes('/property-information/') ||
    id.includes('/space-separated-tokens/') ||
    id.includes('/comma-separated-tokens/') ||
    id.includes('/html-void-elements/')
  ) {
    return 'markdown-render';
  }

  if (id.includes('/katex/')) {
    return 'markdown-katex';
  }

  if (id.includes('/highlight.js/')) {
    return 'markdown-highlight';
  }

  if (id.includes('@douyinfe/semi-ui')) {
    return 'semi-ui';
  }

  if (
    id.includes('react-dropzone') ||
    id.includes('react-fireworks') ||
    id.includes('react-telegram-login') ||
    id.includes('react-toastify') ||
    id.includes('react-turnstile')
  ) {
    return 'react-components';
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
    modulePreload: false,
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
        target: 'https://claud.fishxcode.com',
        changeOrigin: true,
      },
      '/v1': {
        target: 'https://claud.fishxcode.com',
        changeOrigin: true,
      },
      '/v1beta': {
        target: 'https://claud.fishxcode.com',
        changeOrigin: true,
      },
      '/mj': {
        target: 'https://claud.fishxcode.com',
        changeOrigin: true,
      },
      '/pg': {
        target: 'https://claud.fishxcode.com',
        changeOrigin: true,
      },
    },
  },
}));
