import { JsonRpcProvider } from 'ethers'
import { defineStore } from 'pinia'
import { PimlicoBundler } from 'sendop'

export const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY

if (!ALCHEMY_API_KEY) {
	throw new Error('ALCHEMY_API_KEY is not set')
}

enum CHAIN_ID {
	LOCAL = '1337',
	SEPOLIA = '11155111',
}

const DEFAULT_CHAIN_ID = CHAIN_ID.LOCAL

const RPC_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: `http://localhost:8545`,
	[CHAIN_ID.SEPOLIA]: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
}

const EXPLORER_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: '',
	[CHAIN_ID.SEPOLIA]: 'https://scope.sh/11155111',
}

const BUNDLER_URL: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: 'http://localhost:4337',
	[CHAIN_ID.SEPOLIA]: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
}

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
