<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { BrowserWalletConnector, useVueDapp } from '@vue-dapp/core'
import { VueDappModal } from '@vue-dapp/modal'
import '@vue-dapp/modal/dist/style.css'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { useEOAStore } from './stores/useEOA'

const breakpoints = useBreakpoints(breakpointsTailwind)
const { addConnectors, watchWalletChanged, watchDisconnect } = useVueDapp()

addConnectors([new BrowserWalletConnector()])

const eoaStore = useEOAStore()

watchWalletChanged(async wallet => {
	eoaStore.setWallet(wallet.provider)
})

watchDisconnect(() => {
	eoaStore.resetWallet()
})
</script>

<template>
	<div class="min-h-screen flex flex-col">
		<Header />

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
