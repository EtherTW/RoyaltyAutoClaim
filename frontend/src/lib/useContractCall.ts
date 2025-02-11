import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { notify } from '@kyvg/vue3-notification'

export function useContractCall(options: {
	calldata: ComputedRef<string>
	successTitle: string
	waitingTitle: string
	errorTitle: string
}) {
	const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
	const isLoading = ref(false)

	async function send() {
		if (!royaltyAutoClaimStore.royaltyAutoClaim4337) {
			throw new Error('useContractCall: No royaltyAutoClaim4337')
		}

		try {
			isLoading.value = true

			const op = await royaltyAutoClaimStore.royaltyAutoClaim4337.sendCalldata(options.calldata.value)

			notify({
				title: options.waitingTitle,
				text: `op hash: ${op.hash}`,
				type: 'info',
			})

			await op.wait()

			notify({
				title: options.successTitle,
				text: `op hash: ${op.hash}`,
				type: 'success',
			})
		} catch (err: any) {
			notify({
				title: options.errorTitle,
				text: err.message,
				type: 'error',
			})
		} finally {
			isLoading.value = false
		}
	}

	return {
		isLoading,
		send,
	}
}
