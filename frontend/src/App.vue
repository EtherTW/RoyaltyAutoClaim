<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { BrowserWalletConnector, useVueDapp } from '@vue-dapp/core'
import { VueDappModal } from '@vue-dapp/modal'
import '@vue-dapp/modal/dist/style.css'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { Loader2, Settings, X } from 'lucide-vue-next'
import { useEOAStore } from './stores/useEOA'
import { useRoyaltyAutoClaimStore } from './stores/useRoyaltyAutoClaim'

const { addConnectors, watchWalletChanged, watchDisconnect } = useVueDapp()

addConnectors([new BrowserWalletConnector()])

const eoaStore = useEOAStore()

watchWalletChanged(async wallet => {
	eoaStore.setWallet(wallet.provider)
})

watchDisconnect(() => {
	eoaStore.resetWallet()
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
</script>

<template>
	<div class="min-h-screen flex flex-col">
		<header
			class="fixed top-0 left-0 right-0 z-50 h-[156px] -translate-y-[100px] flex items-end bg-background border-b px-4 lg:px-6"
		>
			<div class="h-[56px] flex w-full max-w-6xl mx-auto justify-between items-center">
				<div class="flex items-center gap-6">
					<router-link to="/" class="flex items-center gap-2">
						<h1 class="font-semibold text-lg" :class="{ 'text-md': breakpoints.isSmaller('sm') }">
							RoyaltyAutoClaim
						</h1>
						<Loader2 v-if="royaltyAutoClaimStore.isLoading" :size="16" class="animate-spin" />
					</router-link>
				</div>

				<div class="flex items-center sm:gap-4" :class="{ 'gap-3': breakpoints.isSmaller('sm') }">
					<ConnectButton />

					<RouterLink
						to="/config"
						class="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary"
					>
						<Settings class="hover:text-gray-600" />
					</RouterLink>
				</div>
			</div>
		</header>

		<main class="flex-1 pt-14 pb-5">
			<router-view />
		</main>

		<FooterMeta />
	</div>
	<VueDappModal autoConnect autoConnectBrowserWalletIfSolo />

	<Notifications
		class="break-words"
		:closeOnClick="false"
		:position="breakpoints.isSmaller('md') ? 'bottom center' : 'bottom right'"
	>
		<template #body="{ item, close }">
			<div class="vue-notification" :class="[item.type]">
				<div v-if="item.title" class="notification-title flex items-center justify-between">
					{{ item.title }}
					<Button
						variant="outline"
						size="icon"
						class="w-5 h-5 rounded-full border-none bg-transparent hover:bg-transparent shadow-none text-gray-200 hover:text-white"
						@click="close"
					>
						<X />
					</Button>
				</div>
				<div class="notification-content" v-html="item.text"></div>
			</div>
		</template>
	</Notifications>
</template>
