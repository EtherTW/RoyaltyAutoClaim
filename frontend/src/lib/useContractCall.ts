import { ERROR_NOTIFICATION_DURATION } from '@/config'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { notify } from '@kyvg/vue3-notification'
import { formatError } from './formatError'

export function useContractCall<T extends any[] = []>(options: {
	getCalldata: (...args: T) => string
	successTitle: string
	waitingTitle: string
	errorTitle: string
	onBeforeCall?: (...args: T) => Promise<void> | void
	onAfterCall?: (...args: T) => Promise<void> | void
}) {
	const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
	const isLoading = ref(false)

	async function send(...args: T) {
		if (!royaltyAutoClaimStore.royaltyAutoClaim4337) {
			throw new Error('useContractCall: No royaltyAutoClaim4337')
		}

		try {
			isLoading.value = true

			if (options.onBeforeCall) {
				await options.onBeforeCall(...args)
			}

			const op = await royaltyAutoClaimStore.royaltyAutoClaim4337.sendCalldata(options.getCalldata(...args))

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

			if (options.onAfterCall) {
				await options.onAfterCall(...args)
			}
		} catch (err: any) {
			console.error(err)

			// ignore user rejected action ex. cancel the transaction in the wallet
			if (err.message.includes('user rejected action')) {
				return
			}

			notify({
				title: options.errorTitle,
				text: formatError(err),
				type: 'error',
				duration: ERROR_NOTIFICATION_DURATION,
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
