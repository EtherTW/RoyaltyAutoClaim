import { useEOAStore } from '@/stores/useEOA'
import { IRoyaltyAutoClaim__factory, RegistrationVerifier__factory, RoyaltyAutoClaim__factory } from '@/typechain-v2'
import { useVueDapp } from '@vue-dapp/core'
import { concat } from 'ethers'
import {
	DUMMY_ECDSA_SIGNATURE,
	ENTRY_POINT_V08_ADDRESS,
	EntryPointV08__factory,
	ERC4337Bundler,
	ERC4337Error,
	fetchGasPricePimlico,
	IERC20Errors__factory,
	isSameAddress,
	UserOpBuilder,
} from 'sendop'
import { h } from 'vue'
import { toast } from 'vue-sonner'
import { useBlockchainStore } from '../stores/useBlockchain'
import { buildUserOp, setFixedVerificationGasLimitForZkProof } from './erc4337-utils'
import { extractAndParseRevert, normalizeError, UserRejectedActionError } from './error'
import { EmailSubjectType, genProof, makeDummyProof, ParsedEmailData } from './zkemail-utils'

export function useContractCallV2<T extends unknown[] = []>(options: {
	getCalldata?: (...args: T) => string
	successTitle: string
	errorTitle: string
	onBeforeCall?: (...args: T) => Promise<void> | void
	onAfterCall?: (...args: T) => Promise<void> | void
	getEmailOperation?: () => {
		type: EmailSubjectType
		eml: string
		parsedEmailData: ParsedEmailData | null
	}
}) {
	const blockchainStore = useBlockchainStore()
	const eoaStore = useEOAStore()

	const isLoading = ref(false)

	async function send(...args: T) {
		try {
			isLoading.value = true

			if (options.onBeforeCall) {
				await options.onBeforeCall(...args)
			}

			const senderAddress = blockchainStore.royaltyAutoClaimProxyAddress

			if (options.getEmailOperation) {
				// Email-based ZK proof flow
				const emailOperation = options.getEmailOperation()

				if (!emailOperation.parsedEmailData) {
					throw new Error('useContractCallV2: emailOperation.parsedEmailData is required')
				}

				if (!emailOperation.eml) {
					throw new Error('useContractCallV2: emailOperation.eml is required')
				}

				// Generate calldata based on operation type
				let callData: string
				const iface = IRoyaltyAutoClaim__factory.createInterface()
				if (emailOperation.type === 'registration') {
					callData = iface.encodeFunctionData('registerSubmission', [
						emailOperation.parsedEmailData.title,
						emailOperation.parsedEmailData.recipient,
						emailOperation.parsedEmailData.headerHash,
					])
				} else if (emailOperation.type === 'recipient-update') {
					callData = iface.encodeFunctionData('updateRoyaltyRecipient', [
						emailOperation.parsedEmailData.title,
						emailOperation.parsedEmailData.recipient,
						emailOperation.parsedEmailData.headerHash,
					])
				} else {
					throw new Error('Unknown email operation type')
				}

				// Build user op
				const bundler = new ERC4337Bundler(blockchainStore.pimlicoUrl, undefined, {
					batchMaxCount: 1,
				})
				const op = await buildUserOp({
					royaltyAutoClaimAddress: senderAddress,
					chainId: blockchainStore.chainId,
					client: blockchainStore.client,
					bundler,
					callData,
				})

				// Set dummy proof for gas estimation
				op.setSignature(makeDummyProof(emailOperation.parsedEmailData.signals))

				// Estimate gas
				try {
					await op.estimateGas()
				} catch (e) {
					console.info('handleOps', op.encodeHandleOpsDataWithDefaultGas())
					throw e
				}

				// Set fixed verification gas limit for ZK proof
				setFixedVerificationGasLimitForZkProof(op)

				// Generate proof
				const genProofToast = toast.info('Generating proof...', {
					duration: Infinity,
				})

				const { encodedProof } = await genProof(emailOperation.eml, op.hash())
				op.setSignature(encodedProof)

				toast.dismiss(genProofToast)

				// Send
				try {
					await op.send()
				} catch (e) {
					console.info('handleOps', op.encodeHandleOpsData())
					throw e
				}

				console.info('opHash', op.hash())
				const waitingToast = toast.info('Waiting for transaction...', {
					duration: Infinity,
				})

				// Wait
				const receipt = await op.wait()

				toast.dismiss(waitingToast)

				if (!receipt.success) {
					throw new TransactionError(`UserOp is unsuccessful: ${JSON.stringify(receipt)}`)
				}

				const txLink = receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0]
					?.transactionHash
					? `${blockchainStore.explorerUrl}/tx/${
							receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0]
								.transactionHash
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
			} else {
				const { chainId: walletChainId, connector } = useVueDapp()

				if (walletChainId.value !== Number(blockchainStore.chainId)) {
					await connector.value?.switchChain?.(Number(blockchainStore.chainId))
				}

				if (!options.getCalldata) {
					throw new Error('useContractCall: getCalldata is required')
				}

				if (!eoaStore.signer) {
					throw new Error('Please connect your EOA wallet first')
				}

				// EOA signature flow
				const ep8 = EntryPointV08__factory.connect(ENTRY_POINT_V08_ADDRESS, blockchainStore.client)
				const op = new UserOpBuilder({
					chainId: blockchainStore.chainId,
					bundler: new ERC4337Bundler(blockchainStore.pimlicoUrl),
					entryPointAddress: ENTRY_POINT_V08_ADDRESS,
				})
					.setSender(blockchainStore.royaltyAutoClaimProxyAddress)
					.setNonce(await ep8.getNonce(senderAddress, 0))
					.setCallData(options.getCalldata(...args))
					.setGasPrice(await fetchGasPricePimlico(blockchainStore.pimlicoUrl))
					.setSignature(concat([DUMMY_ECDSA_SIGNATURE, eoaStore.signer.address]))

				try {
					await op.estimateGas()
				} catch (e) {
					console.info('handleOps', op.encodeHandleOpsDataWithDefaultGas())
					throw e
				}

				// sign
				const signature = await eoaStore.signer.signTypedData(...op.typedData())
				op.setSignature(concat([signature, eoaStore.signer.address]))

				// send
				try {
					await op.send()
				} catch (e) {
					console.info('handleOps', op.encodeHandleOpsData())
					throw e
				}

				console.info('opHash', op.hash())
				const waitingToast = toast.info('Waiting for transaction...', {
					duration: Infinity,
				})

				// wait
				const receipt = await op.wait()

				toast.dismiss(waitingToast)

				if (!receipt.success) {
					throw new TransactionError(`UserOp is unsuccessful: ${JSON.stringify(receipt)}`)
				}

				const txLink = receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0]
					?.transactionHash
					? `${blockchainStore.explorerUrl}/tx/${
							receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0]
								.transactionHash
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
			}

			if (options.onAfterCall) {
				await options.onAfterCall(...args)
			}
		} catch (e: unknown) {
			console.error(e)
			const err = normalizeError(e)

			let revert = ''

			if (err instanceof ERC4337Error) {
				revert = extractAndParseRevert(err, {
					RoyaltyAutoClaim: RoyaltyAutoClaim__factory.createInterface(),
					RegistrationVerifier: RegistrationVerifier__factory.createInterface(),
					IERC20Errors: IERC20Errors__factory.createInterface(),
				})
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
