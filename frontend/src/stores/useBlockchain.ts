import {
	ALCHEMY_API_KEY,
	BUNDLER_URL,
	CHAIN_ID,
	EXPLORER_URL,
	IS_DEV,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA,
	RPC_URL,
	TENDERLY_RPC_URL,
} from '@/config'
import { JsonRpcProvider } from 'ethers'
import { alchemy, AlchemyChain, pimlico, PimlicoChain } from 'evm-providers'
import { defineStore } from 'pinia'
import { ERC4337Bundler } from 'sendop'

export const useBlockchainStore = defineStore(
	'useBlockchainStore',
	() => {
		const route = useRoute()

		const isTestnet = ref(IS_DEV ? true : false)

		function setIsTestnet(value: boolean) {
			isTestnet.value = value
		}

		const chainId = computed(() => {
			if (route.path.includes('v1')) {
				return isTestnet.value ? CHAIN_ID.SEPOLIA : CHAIN_ID.MAINNET
			}
			return isTestnet.value ? CHAIN_ID.BASE_SEPOLIA : CHAIN_ID.BASE
		})

		const chainIds = computed(() => {
			const ids = IS_DEV ? Object.values(CHAIN_ID) : Object.values(CHAIN_ID).filter(id => id !== CHAIN_ID.LOCAL)
			return ids.filter(id => {
				if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA && id === CHAIN_ID.SEPOLIA) {
					return false
				}
				if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET && id === CHAIN_ID.MAINNET) {
					return false
				}
				return true
			})
		})

		const royaltyAutoClaimProxyAddress = computed(() => {
			switch (chainId.value) {
				// case CHAIN_ID.LOCAL:
				// 	return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL
				case CHAIN_ID.SEPOLIA:
					if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA) {
						console.warn('royaltyAutoClaimProxyAddress: sepolia address is not set')
						return ''
					}
					return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA
				case CHAIN_ID.MAINNET:
					if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET) {
						console.warn('royaltyAutoClaimProxyAddress: mainnet address is not set')
						return ''
					}
					return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET
				case CHAIN_ID.BASE_SEPOLIA:
					if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA) {
						console.warn('royaltyAutoClaimProxyAddress: base sepolia address is not set')
						return ''
					}
					return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA
				// case CHAIN_ID.BASE:
				// 	if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE) {
				// 		console.warn('royaltyAutoClaimProxyAddress: base address is not set')
				// 		return ''
				// 	}
				// 	return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE
				default:
					console.warn(`royaltyAutoClaimProxyAddress: Unsupported chain id: ${chainId.value}`)
					return ''
			}
		})

		const rpcUrl = computed(() => RPC_URL[chainId.value])

		const explorerUrl = computed(() => `${EXPLORER_URL[chainId.value]}`)

		const client = computed(
			() =>
				new JsonRpcProvider(rpcUrl.value, undefined, {
					staticNetwork: true,
				}),
		)

		const clientNoBatch = computed(
			() =>
				new JsonRpcProvider(rpcUrl.value, undefined, {
					batchMaxCount: 1,
					staticNetwork: true,
				}),
		)

		// only used for fetching events by eth_getLogs
		const tenderlyClient = computed(
			() =>
				new JsonRpcProvider(TENDERLY_RPC_URL[chainId.value], undefined, {
					// do not request chain ID on requests to validate the underlying chain has not changed
					// @docs: https://docs.ethers.org/v6/api/providers/jsonrpc/#JsonRpcApiProviderOptions
					staticNetwork: true,
				}),
		)

		const bundlerUrl = computed(() => BUNDLER_URL[chainId.value])

		const bundler = computed(() => {
			return new ERC4337Bundler(bundlerUrl.value)
		})

		const alchemyUrl = computed(() => {
			return alchemy(Number(chainId.value) as AlchemyChain, ALCHEMY_API_KEY)
		})

		const pimlicoUrl = computed(() => {
			return pimlico(Number(chainId.value) as PimlicoChain, 'pim_nDodV8Xhz7bXSEoeL9UbGh')
		})

		return {
			chainId,
			chainIds,
			royaltyAutoClaimProxyAddress,
			rpcUrl,
			explorerUrl,
			client,
			clientNoBatch,
			bundlerUrl,
			bundler,
			tenderlyClient,
			alchemyUrl,
			pimlicoUrl,
			isTestnet,
			setIsTestnet,
		}
	},
	{
		persist: {
			pick: ['isTestnet'],
		},
	},
)
