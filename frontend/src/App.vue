<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { BrowserWalletConnector, useVueDapp } from '@vue-dapp/core'
import { VueDappModal, useVueDappModal } from '@vue-dapp/modal'
import '@vue-dapp/modal/dist/style.css'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { LogOut, Settings } from 'lucide-vue-next'
import { useEOAStore } from './stores/useEOA'
import { X } from 'lucide-vue-next'

const { addConnectors, status, address, isConnected, disconnect, watchWalletChanged, watchDisconnect } = useVueDapp()

addConnectors([new BrowserWalletConnector()])

const eoaStore = useEOAStore()

watchWalletChanged(async wallet => {
	eoaStore.setWallet(wallet.provider)
})

watchDisconnect(() => {
	eoaStore.resetWallet()
})

const onClickConnect = () => {
	const { open } = useVueDappModal()
	open()
}

const onClickDisconnect = () => {
	disconnect()
}

const breakpoints = useBreakpoints(breakpointsTailwind)
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
					<Address v-if="isConnected" :address="address">
						<template #button>
							<Button class="address-button" variant="link" size="icon" @click="onClickDisconnect">
								<LogOut />
							</Button>
						</template>
					</Address>
					<Button
						v-else
						@click="onClickConnect"
						:variant="isConnected ? 'default' : 'outline'"
						:disabled="status === 'connecting'"
					>
						{{ status === 'connecting' ? 'Connecting...' : isConnected ? 'Connected' : 'Connect' }}
					</Button>

					<RouterLink
						to="/config"
						class="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary"
					>
						<Settings />
					</RouterLink>
				</div>
			</div>
		</header>

		<main class="flex-1 pt-14">
			<router-view />
		</main>
	</div>
	<VueDappModal autoConnect autoConnectBrowserWalletIfSolo />

	<Notifications
		class="break-words"
		:closeOnClick="false"
		:position="breakpoints.isSmaller('md') ? 'bottom center' : 'bottom right'"
	>
		<template #body="{ item, close }">
			<div class="vue-notification" :class="[item.type]">
				<div v-if="item.title" class="notification-title">{{ item.title }}</div>
				<div class="notification-content">{{ item.text }}</div>
				<Button
					variant="outline"
					size="icon"
					class="w-5 h-5 absolute top-1.5 right-2.5 border-none bg-transparent hover:bg-transparent text-gray-200 hover:text-white"
					@click="close"
				>
					<X class="" />
				</Button>
			</div>
		</template>
	</Notifications>
</template>
