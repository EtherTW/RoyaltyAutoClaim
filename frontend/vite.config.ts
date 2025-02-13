import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import autoprefixer from 'autoprefixer'
import tailwind from 'tailwindcss'
import { defineConfig } from 'vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import NotificationsResolver from '@kyvg/vue3-notification/auto-import-resolver'

// https://vite.dev/config/
export default defineConfig({
	base: '/RoyaltyAutoClaim/', // for github pages
	css: {
		postcss: {
			plugins: [tailwind(), autoprefixer()],
		},
	},
	plugins: [
		vue(),
		AutoImport({
			dts: 'src/auto-import.d.ts',
			imports: ['vue', 'vue-router', 'pinia'],
			eslintrc: {
				enabled: true,
			},
		}),
		Components({
			resolvers: [NotificationsResolver()],
		}),
	],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
})
