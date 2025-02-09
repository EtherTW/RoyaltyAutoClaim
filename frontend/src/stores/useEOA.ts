import type { EIP1193Provider } from '@vue-dapp/core'
import { BrowserProvider, JsonRpcSigner } from 'ethers'
import { defineStore } from 'pinia'

export const useEOAStore = defineStore('useEOAStore', () => {
	const provider = ref<BrowserProvider | null>(null)
	const signer = ref<JsonRpcSigner | null>(null)

	async function setWallet(p: EIP1193Provider) {
		provider.value = markRaw(new BrowserProvider(p))
		signer.value = await provider.value.getSigner()
	}

	function resetWallet() {
		provider.value = null
		signer.value = null
	}

	return {
		provider,
		signer,
		setWallet,
		resetWallet,
	}
})
