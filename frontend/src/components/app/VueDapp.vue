<script setup lang="ts">
import { useEOAStore } from '@/stores/useEOA'
import { BrowserWalletConnector, useVueDapp } from '@vue-dapp/core'
import { VueDappModal } from '@vue-dapp/modal'

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
	<VueDappModal :dark="mode === 'dark'" autoConnect autoConnectBrowserWalletIfSolo />
</template>
