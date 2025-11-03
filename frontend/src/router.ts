import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
	history: createWebHistory('/RoyaltyAutoClaim/'),
	routes: [
		{
			path: '/',
			name: 'v2',
			component: () => import('@/views/HomePageV2.vue'),
		},
		{
			path: '/config',
			name: 'v2-config',
			component: () => import('@/views/ConfigPageV2.vue'),
		},

		{
			path: '/v1',
			children: [
				{
					path: '',
					name: 'v1',
					component: () => import('@/views/HomePage.vue'),
				},
				{
					path: 'config',
					name: 'v1-config',
					component: () => import('@/views/ConfigPage.vue'),
				},
			],
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
