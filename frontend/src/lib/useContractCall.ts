import { ERROR_NOTIFICATION_DURATION } from '@/config'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { notify } from '@kyvg/vue3-notification'
import { formatErrMsg, normalizeError, UserRejectedActionError } from './error'

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

			const receipt = await op.wait()

			if (!receipt.success) {
				throw new TransactionError(`UserOp is unsuccessful: ${JSON.stringify(receipt)}`)
			}

			notify({
				title: options.successTitle,
				text: `op hash: ${op.hash}`,
				type: 'success',
			})

			if (options.onAfterCall) {
				await options.onAfterCall(...args)
			}
		} catch (error: unknown) {
			const err = normalizeError(error)
			console.error(err)

			// Do not show error when the user cancels their action
			if (err instanceof UserRejectedActionError) {
				return
			}

			notify({
				title: options.errorTitle,
				text: formatErrMsg(err),
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

export class TransactionError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'TransactionError'
	}
}
