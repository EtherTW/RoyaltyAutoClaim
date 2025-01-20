import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/',
			name: 'home',
			component: () => import('@/views/Home.vue'),
		},
		{
			path: '/config',
			name: 'config',
			component: () => import('@/views/Config.vue'),
		},
	],
})

export default router
