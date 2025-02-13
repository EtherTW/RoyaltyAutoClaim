import { JsonRpcProvider } from 'ethers'
import { defineStore } from 'pinia'
import { PimlicoBundler } from 'sendop'
import { CHAIN_ID, DEFAULT_CHAIN_ID, RPC_URL, EXPLORER_URL, BUNDLER_URL } from '@/config'

export const useBlockchainStore = defineStore('useBlockchainStore', () => {
	const chainId = ref<CHAIN_ID>(DEFAULT_CHAIN_ID)

	function setChainId(id: CHAIN_ID) {
		chainId.value = id
	}

	const rpcUrl = computed(() => RPC_URL[chainId.value])

	const explorerUrl = computed(() => `${EXPLORER_URL[chainId.value]}`)

	const client = computed(() => new JsonRpcProvider(rpcUrl.value))

	const bundlerUrl = computed(() => BUNDLER_URL[chainId.value])

	const bundler = computed(() => new PimlicoBundler(chainId.value, bundlerUrl.value))

	return {
		chainId,
		rpcUrl,
		explorerUrl,
		client,
		bundlerUrl,
		bundler,
		setChainId,
	}
})
