import { ROYALTY_AUTO_CLAIM_PROXY_ADDRESS } from '@/config'
import { RoyaltyAutoClaim4337 } from '@/lib/RoyaltyAutoClaim4337'
import { RoyaltyAutoClaim__factory } from '@/typechain-types'
import { notify } from '@kyvg/vue3-notification'
import { JsonRpcSigner } from 'ethers'
import { defineStore } from 'pinia'
import { useBlockchainStore } from './useBlockchain'
import { useEOAStore } from './useEOA'

export const useRoyaltyAutoClaimStore = defineStore('useRoyaltyAutoClaimStore', () => {
	const blockchainStore = useBlockchainStore()

	const isLoading = ref(false)
	const isBtnDisabled = computed(() => isLoading.value || !royaltyAutoClaim4337.value)

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

	async function registerSubmission(title: string, recipient: string) {
		if (!royaltyAutoClaim4337.value) {
			throw new Error('No royaltyAutoClaim')
		}

		try {
			isLoading.value = true

			const op = await royaltyAutoClaim4337.value.sendCalldata(
				royaltyAutoClaim.value.interface.encodeFunctionData('registerSubmission', [title, recipient]),
			)

			notify({
				title: 'Waiting for Register Submission',
				text: `Register Submission ${title} to ${recipient}, op hash: ${op.hash}`,
				type: 'info',
			})

			await op.wait()

			notify({
				title: 'Successfully Registered Submission',
				text: `Register Submission ${title} to ${recipient}, op hash: ${op.hash}`,
				type: 'success',
			})
		} catch (err: any) {
			notify({
				title: 'Error Registering Submission',
				text: err.message,
				type: 'error',
			})
		} finally {
			isLoading.value = false
		}
	}

	return {
		royaltyAutoClaim,
		royaltyAutoClaim4337,
		registerSubmission,
		isLoading,
		isBtnDisabled,
	}
})
