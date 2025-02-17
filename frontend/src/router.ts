import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
	history: createWebHistory('/RoyaltyAutoClaim/'),
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
	scrollBehavior: (_to, _from, savedPosition) => {
		if (savedPosition) {
			return savedPosition
		} else {
			return { top: 0 }
		}
	},
})

export default router
