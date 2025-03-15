import { JsonRpcProvider } from 'ethers'
import { defineStore } from 'pinia'
import { AlchemyBundler, PimlicoBundler } from 'sendop'
import { CHAIN_ID, DEFAULT_CHAIN_ID, RPC_URL, EXPLORER_URL, BUNDLER_URL } from '@/config'

export const useBlockchainStore = defineStore('useBlockchainStore', () => {
	const chainId = ref<CHAIN_ID>(DEFAULT_CHAIN_ID)

	function setChainId(id: CHAIN_ID) {
		chainId.value = id
	}

	const rpcUrl = computed(() => RPC_URL[chainId.value])

	const explorerUrl = computed(() => `${EXPLORER_URL[chainId.value]}`)

	const client = computed(() => new JsonRpcProvider(rpcUrl.value))

	const clientNoBatch = computed(
		() =>
			new JsonRpcProvider(rpcUrl.value, undefined, {
				batchMaxCount: 1,
			}),
	)

	const bundlerUrl = computed(() => BUNDLER_URL[chainId.value])

	const bundler = computed(() => {
		if (chainId.value === CHAIN_ID.LOCAL) {
			return new PimlicoBundler(chainId.value, bundlerUrl.value)
		}
		return new AlchemyBundler(chainId.value, bundlerUrl.value)
	})

	return {
		chainId,
		rpcUrl,
		explorerUrl,
		client,
		clientNoBatch,
		bundlerUrl,
		bundler,
		setChainId,
	}
})
