import { ERROR_NOTIFICATION_DURATION } from '@/config'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { notify } from '@kyvg/vue3-notification'
import { formatErrMsg, normalizeError, UserRejectedActionError } from './error'
import { isSameAddress } from 'sendop'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { useVueDapp } from '@vue-dapp/core'

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

		const { chainId: walletChainId, connector } = useVueDapp()
		const blockchainStore = useBlockchainStore()

		if (walletChainId.value !== Number(blockchainStore.chainId)) {
			await connector.value?.switchChain?.(Number(blockchainStore.chainId))
		}

		const senderAddress = royaltyAutoClaimStore.royaltyAutoClaim4337.getSender()

		try {
			isLoading.value = true

			if (options.onBeforeCall) {
				await options.onBeforeCall(...args)
			}

			const op = await royaltyAutoClaimStore.royaltyAutoClaim4337.sendCalldata(options.getCalldata(...args))
			console.info(`${options.waitingTitle} opHash: ${op.hash}`)

			const waitingToast = Date.now()
			notify({
				id: waitingToast,
				title: options.waitingTitle,
				text: `op hash: ${op.hash}`,
				type: 'info',
				duration: -1,
			})

			const receipt = await op.wait()

			if (!receipt.success) {
				throw new TransactionError(`UserOp is unsuccessful: ${JSON.stringify(receipt)}`)
			}

			notify.close(waitingToast)

			const txLink = receipt.logs.filter(log => isSameAddress(log.address, senderAddress))[0]?.transactionHash
				? `${useBlockchainStore().explorerUrl}/tx/${
						receipt.logs.filter(log => isSameAddress(log.address, senderAddress))[0].transactionHash
				  }`
				: '#'

			notify({
				title: options.successTitle,
				text: `<a class="text-blue-700 hover:underline" href="${txLink}" target="_blank">View on Explorer</a>`,
				type: 'success',
				duration: -1,
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
