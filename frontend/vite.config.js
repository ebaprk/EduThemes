import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  return {
    resolve: {alias:{"@":fileURLToPath(new URL("./src",import.meta.url))},dedupe:["react","react-dom"]},
    build: {
      manifest: true,
    },
    plugins: [react(), tailwindcss()],
    server: {
        port: 3000, // Change this to your desired port
    },
    base: "/",
  };
});