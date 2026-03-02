import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        proxy: {
            '/zupa/ws': {
                target: 'ws://localhost:8080',
                ws: true
            },
            '/auth': 'http://localhost:8080',
            '/agent': 'http://localhost:8080'
        }
    }
});
