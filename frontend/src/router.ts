import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: '/',
			name: 'home',
			component: () => import('@/views/HomePage.vue'),
		},
		{
			path: '/config',
			name: 'config',
			component: () => import('@/views/ConfigPage.vue'),
		},
	],
})

export default router
