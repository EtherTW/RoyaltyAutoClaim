import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true, // for auto import
		testTimeout: 1800000, // 30 minutes
		hookTimeout: 1800000, // 30 minutes
	},
})
