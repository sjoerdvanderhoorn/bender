import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

function copyAssetsPlugin() {
  return {
    name: 'copy-assets',
    closeBundle() {
      // Copy manifest.json
      fs.copyFileSync(path.resolve(__dirname, 'manifest.json'), path.resolve(__dirname, 'dist/manifest.json'));
      // Copy background.js
      fs.copyFileSync(path.resolve(__dirname, 'src/background.js'), path.resolve(__dirname, 'dist/background.js'));
      // Ensure dist/src directory exists for llminify.js
      const distSrcDir = path.resolve(__dirname, 'dist/src/services');
      if (!fs.existsSync(distSrcDir)) {
        fs.mkdirSync(distSrcDir, { recursive: true });
      }
      // Copy llminify.js
      fs.copyFileSync(path.resolve(__dirname, 'src/services/llminify.js'), path.resolve(__dirname, 'dist/src/services/llminify.js'));
      // Do NOT copy sidepanel.html, let Vite handle HTML output and rewriting
      // Ensure dist/js directory exists before copying sidepanel.js
      const distJsDir = path.resolve(__dirname, 'dist/js');
      if (!fs.existsSync(distJsDir)) {
        fs.mkdirSync(distJsDir, { recursive: true });
      }
      fs.copyFileSync(path.resolve(__dirname, 'src/sidepanel.js'), path.resolve(distJsDir, 'sidepanel.js'));
      // Copy all assets (icons, etc.)
      const srcAssetsDir = path.resolve(__dirname, 'src/assets');
      const distAssetsDir = path.resolve(__dirname, 'dist/assets');
      if (!fs.existsSync(distAssetsDir)) {
        fs.mkdirSync(distAssetsDir, { recursive: true });
      }
      for (const file of fs.readdirSync(srcAssetsDir)) {
        fs.copyFileSync(
          path.resolve(srcAssetsDir, file),
          path.resolve(distAssetsDir, file)
        );
      }
      // Remove copying of main.js, let Vite handle the build and HTML rewriting
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), copyAssetsPlugin()],
  resolve: {
    alias: {
      fs: path.resolve(__dirname, 'src/empty.js'),
      path: path.resolve(__dirname, 'src/empty.js'),
      crypto: path.resolve(__dirname, 'src/empty.js'),
      os: path.resolve(__dirname, 'src/empty.js'),
    },
  },
  build: {
    outDir: 'dist',
    minify: false, // Disable minification
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html', // Use relative path so Vite recognizes it as an entry
      },
    },
  },
})
