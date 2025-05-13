import { JsonRpcProvider, Network } from 'ethers'
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
	TENDERLY_RPC_URL,
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
			tenderlyClient,
			setChainId,
		}
	},
	{
		persist: {
			pick: ['chainId'],
		},
	},
)
