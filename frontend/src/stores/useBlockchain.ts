import { JsonRpcProvider } from 'ethers'
import { defineStore } from 'pinia'
import { AlchemyBundler, PimlicoBundler } from 'sendop'
import {
	CHAIN_ID,
	RPC_URL,
	EXPLORER_URL,
	BUNDLER_URL,
	IS_DEV,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL,
} from '@/config'

export const useBlockchainStore = defineStore(
	'useBlockchainStore',
	() => {
		const chainId = ref<CHAIN_ID>(CHAIN_ID.SEPOLIA)

		function setChainId(id: CHAIN_ID) {
			chainId.value = id
		}

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
				case CHAIN_ID.LOCAL:
					return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_LOCAL
				case CHAIN_ID.SEPOLIA:
					if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA) {
						throw new Error('royaltyAutoClaimProxyAddress: sepolia address is not set')
					}
					return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA
				case CHAIN_ID.MAINNET:
					if (!ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET) {
						throw new Error('royaltyAutoClaimProxyAddress: mainnet address is not set')
					}
					return ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET
				default:
					throw new Error(`royaltyAutoClaimProxyAddress: Unsupported chain id: ${chainId.value}`)
			}
		})

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
			chainIds,
			royaltyAutoClaimProxyAddress,
			rpcUrl,
			explorerUrl,
			client,
			clientNoBatch,
			bundlerUrl,
			bundler,
			setChainId,
		}
	},
	{
		persist: {
			pick: ['chainId'],
		},
	},
)
