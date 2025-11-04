<script setup lang="ts">
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { breakpointsTailwind } from '@vueuse/core'
import { Loader2 } from 'lucide-vue-next'

const route = useRoute()

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

const isV1Route = computed(() => {
	return route.path.includes('v1')
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const mdSmallerOrEqual = breakpoints.smallerOrEqual('md')
</script>

<template>
	<header
		class="fixed top-0 left-0 right-0 z-50 h-[156px] -translate-y-[100px] flex items-end bg-background border-b px-4 lg:px-6"
	>
		<div class="h-[56px] flex w-full max-w-6xl mx-auto justify-between items-center">
			<div class="flex items-center" :class="mdSmallerOrEqual ? 'gap-4' : 'gap-6'">
				<div class="flex items-center gap-2">
					<h1 class="font-semibold text-lg" :class="{ 'text-md': mdSmallerOrEqual }">RoyaltyAutoClaim</h1>
				</div>

				<router-link to="/" class="text-sm flex items-center gap-2">
					<div
						:class="{
							'text-muted-foreground': isV1Route,
						}"
					>
						{{ mdSmallerOrEqual ? 'v2' : 'Version 2 (Base)' }}
					</div>
				</router-link>

				<router-link to="/v1" class="text-sm flex items-center gap-2">
					<div
						:class="{
							'text-muted-foreground': !isV1Route,
						}"
					>
						{{ mdSmallerOrEqual ? 'v1' : 'Version 1 (Mainnet)' }}
					</div>
				</router-link>

				<Loader2 v-if="royaltyAutoClaimStore.isLoading" :size="16" class="animate-spin" />
			</div>

			<div class="flex items-center sm:gap-4" :class="{ 'gap-3': mdSmallerOrEqual }">
				<NetworkSelector />
				<ConnectButton />
			</div>
		</div>
	</header>
</template>

<style lang="css"></style>
