import { useEOAStore } from '@/stores/useEOA'
import { RoyaltyAutoClaim__factory } from '@/typechain-types'
import { useVueDapp } from '@vue-dapp/core'
import { concat, getBytes } from 'ethers'
import {
	DUMMY_ECDSA_SIGNATURE,
	ENTRY_POINT_V07_ADDRESS,
	EntryPointV07__factory,
	ERC4337Error,
	fetchGasPriceAlchemy,
	isSameAddress,
	UserOpBuilder,
} from 'sendop'
import { h } from 'vue'
import { toast } from 'vue-sonner'
import { useBlockchainStore } from '../stores/useBlockchain'
import { normalizeError, parseContractRevert, UserRejectedActionError } from './error'

export function useContractCall<T extends unknown[] = []>(options: {
	getCalldata: (...args: T) => string
	successTitle: string
	waitingTitle: string
	errorTitle: string
	onBeforeCall?: (...args: T) => Promise<void> | void
	onAfterCall?: (...args: T) => Promise<void> | void
}) {
	const blockchainStore = useBlockchainStore()
	const eoaStore = useEOAStore()

	const isLoading = ref(false)

	async function send(...args: T) {
		if (!eoaStore.signer) {
			throw new Error('Please connect your EOA wallet first')
		}

		const { chainId: walletChainId, connector } = useVueDapp()

		if (walletChainId.value !== Number(blockchainStore.chainId)) {
			await connector.value?.switchChain?.(Number(blockchainStore.chainId))
		}

		try {
			isLoading.value = true

			if (options.onBeforeCall) {
				await options.onBeforeCall(...args)
			}

			const senderAddress = blockchainStore.royaltyAutoClaimProxyAddress

			// estimate gas
			const ep7 = EntryPointV07__factory.connect(ENTRY_POINT_V07_ADDRESS, blockchainStore.client)
			const op = new UserOpBuilder({
				chainId: blockchainStore.chainId,
				bundler: blockchainStore.bundler,
				entryPointAddress: ENTRY_POINT_V07_ADDRESS,
			})
				.setSender(blockchainStore.royaltyAutoClaimProxyAddress)
				.setNonce(await ep7.getNonce(senderAddress, 0))
				.setCallData(options.getCalldata(...args))
				.setGasPrice(await fetchGasPriceAlchemy(blockchainStore.alchemyUrl))
				.setSignature(concat([DUMMY_ECDSA_SIGNATURE, eoaStore.signer.address]))

			await op.estimateGas()

			// sign
			const signature = await eoaStore.signer.signMessage(getBytes(op.hash()))
			op.setSignature(concat([signature, eoaStore.signer.address]))

			console.info(`${options.waitingTitle} opHash: ${op.hash()}`)

			// send
			await op.send()

			const waitingToast = toast.info(options.waitingTitle, {
				description: `op hash: ${op.hash()}`,
				duration: Infinity,
			})

			// wait
			const receipt = await op.wait()

			if (!receipt.success) {
				throw new TransactionError(`UserOp is unsuccessful: ${JSON.stringify(receipt)}`)
			}

			toast.dismiss(waitingToast)

			const txLink = receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0]
				?.transactionHash
				? `${useBlockchainStore().explorerUrl}/tx/${
						receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0].transactionHash
				  }`
				: '#'

			toast.success(options.successTitle, {
				description: h(
					'a',
					{
						class: 'text-blue-700 hover:underline cursor-pointer',
						href: txLink,
						target: '_blank',
					},
					'View on Explorer',
				),
				duration: Infinity,
			})

			if (options.onAfterCall) {
				await options.onAfterCall(...args)
			}
		} catch (e: unknown) {
			const err = normalizeError(e)

			let revert = ''

			if (err instanceof ERC4337Error) {
				console.error(err.message, err.method, err.data)
				if (err.data?.revertData) {
					const revertMsg = parseContractRevert(err.data.revertData, {
						RoyaltyAutoClaim: RoyaltyAutoClaim__factory.createInterface(),
					})
					if (revertMsg) {
						console.error(revertMsg)
						revert = revertMsg
					}
				}
			} else {
				console.log(err)
			}

			// Do not show error when the user cancels their action
			if (err instanceof UserRejectedActionError) {
				return
			}

			toast.error(options.errorTitle, {
				description: revert || err.message,
				duration: Infinity,
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
