import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		testTimeout: 100000,
	},
	resolve: {
		alias: { '@': path.resolve(__dirname, 'src') },
	},
})
