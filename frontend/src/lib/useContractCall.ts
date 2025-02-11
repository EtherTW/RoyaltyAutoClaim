import { ERROR_NOTIFICATION_DURATION } from '@/config'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { IRoyaltyAutoClaim__factory } from '@/typechain-types'
import { notify } from '@kyvg/vue3-notification'
import { Interface } from 'ethers'

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
			// ignore user rejected action ex. cancel the transaction in the wallet
			if (err.message.includes('user rejected action')) {
				return
			}

			notify({
				title: options.errorTitle,
				text: parseError(err),
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

function parseError(error: any): string {
	if (typeof error?.message === 'string') {
		// Special handling for simulation errors
		if (error.message.includes('eth_estimateUserOperationGas')) {
			const match = error.message.match(/UserOperation reverted during simulation with reason: (.+)$/)
			const contractError = match?.[1]

			if (contractError) {
				const iface = new Interface(IRoyaltyAutoClaim__factory.abi)
				const decodedError = iface.parseError(contractError)
				if (decodedError) {
					return `${decodedError.name}(${decodedError.args.join(', ')})`
				}
			}
		}

		// Don't extract if it's a different JSON-RPC Error
		if (error.message.startsWith('JSON-RPC Error:')) {
			return error.message
		}

		// Extract everything before the first parenthesis
		const match = error.message.match(/^([^(]+)/)
		if (match) {
			return match[1].trim()
		}
	}
	return error?.message || 'Unknown error occurred'
}
