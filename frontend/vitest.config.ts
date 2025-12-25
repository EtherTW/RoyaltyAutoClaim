import { defineConfig } from 'vitest/config'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
	plugins: [
		vue(),
		AutoImport({
			imports: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'vitest'],
		}),
	],
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		testTimeout: 1_000_000,
	},
	resolve: {
		alias: { '@': path.resolve(__dirname, 'src') },
	},
})
