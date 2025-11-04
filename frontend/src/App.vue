<script setup lang="ts">
import { BrowserWalletConnector, useVueDapp } from '@vue-dapp/core'
import { VueDappModal } from '@vue-dapp/modal'
import { CircleCheck, CircleX } from 'lucide-vue-next'
import { Toaster } from 'vue-sonner'
import { useEOAStore } from './stores/useEOA'

import '@vue-dapp/modal/dist/style.css'

const { addConnectors, watchWalletChanged, watchDisconnect } = useVueDapp()

addConnectors([new BrowserWalletConnector()])

const eoaStore = useEOAStore()

watchWalletChanged(async wallet => {
	eoaStore.setWallet(wallet.provider)
})

watchDisconnect(() => {
	eoaStore.resetWallet()
})

const mode = useColorMode()
</script>

<template>
	<div class="flex flex-col">
		<Header />

		<main class="flex-1 pt-14 pb-5">
			<router-view />
		</main>

		<FooterMeta />
	</div>
	<VueDappModal autoConnect autoConnectBrowserWalletIfSolo />

	<Toaster :theme="mode === 'dark' ? 'light' : 'dark'" position="bottom-right" closeButton>
		<template #error-icon>
			<CircleX class="text-red-600 w-[18px] h-[18px]" />
		</template>
		<template #success-icon>
			<CircleCheck class="text-green-600 w-[18px] h-[18px]" />
		</template>
	</Toaster>
</template>

<style>
[data-sonner-toast][data-styled='true'] [data-close-button] {
	--toast-close-button-transform: translate(285px, -6px);
}

/* Toast width */
[data-sonner-toast] {
	width: 300px; /* the width of the toast */
}
[data-sonner-toaster][data-x-position='right'] {
	width: 280px; /* the distance from the right edge */
}

/* Scrollable content */
[data-sonner-toast] [data-content] {
	max-height: 200px;
	overflow-y: auto;
	padding-right: 4px;
}

/* Align icon to the top */
[data-sonner-toast][data-styled='true'] {
	align-items: flex-start;
}

[data-sonner-toast][data-styled='true'] [data-icon] {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 18px;
	height: 18px;
	margin: 0;
}

/* Disable lift animation */
/* [data-sonner-toast] {
	--lift: 0;
	--lift-amount: 0;
} */
</style>
