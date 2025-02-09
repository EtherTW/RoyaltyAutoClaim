<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { ref } from 'vue'
import { Settings } from 'lucide-vue-next'
import { notify } from '@kyvg/vue3-notification'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'

const breakpoints = useBreakpoints(breakpointsTailwind)

const isConnected = ref(false)

const handleConnect = () => {
	// TODO: Implement connection logic
	isConnected.value = !isConnected.value
}

onMounted(() => {
	notify({
		title: 'Hello',
		text: 'World',
		type: 'success',
	})
})
</script>

<template>
	<div class="min-h-screen flex flex-col">
		<header class="fixed top-0 left-0 right-0 z-50 bg-background border-b px-4 lg:px-6 h-14 flex items-center">
			<div class="flex w-full max-w-6xl mx-auto justify-between items-center">
				<div class="flex items-center gap-6">
					<router-link to="/" class="">
						<h1 class="font-semibold text-lg">RoyaltyAutoClaim</h1>
					</router-link>
				</div>

				<div class="flex items-center gap-6">
					<Button @click="handleConnect" :variant="isConnected ? 'default' : 'outline'">
						{{ isConnected ? 'Connected' : 'Connect' }}
					</Button>

					<router-link
						to="/config"
						class="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary"
					>
						<Settings />
					</router-link>
				</div>
			</div>
		</header>

		<main class="flex-1 pt-14">
			<router-view />
		</main>
	</div>
	<notifications :position="breakpoints.isSmaller('md') ? 'top center' : 'bottom right'" />
</template>
