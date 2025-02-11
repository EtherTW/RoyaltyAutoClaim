import { ROYALTY_AUTO_CLAIM_PROXY_ADDRESS } from '@/config'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { RoyaltyAutoClaim__factory } from '@/typechain-types'
import { JsonRpcSigner } from 'ethers'
import { defineStore } from 'pinia'
import { useBlockchainStore } from './useBlockchain'
import { useEOAStore } from './useEOA'

export const useRoyaltyAutoClaimStore = defineStore('useRoyaltyAutoClaimStore', () => {
	const blockchainStore = useBlockchainStore()

	const royaltyAutoClaim = computed(() => {
		return RoyaltyAutoClaim__factory.connect(ROYALTY_AUTO_CLAIM_PROXY_ADDRESS, blockchainStore.client)
	})

	const royaltyAutoClaim4337 = computed(() => {
		const eoaStore = useEOAStore()

		if (eoaStore.signer) {
			return new RoyaltyAutoClaim4337({
				client: blockchainStore.client,
				bundler: blockchainStore.bundler,
				signer: eoaStore.signer as JsonRpcSigner,
			})
		}

		return null
	})

	return {
		royaltyAutoClaim,
		royaltyAutoClaim4337,
	}
})
