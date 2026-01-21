import { useEOAStore } from '@/stores/useEOA'
import { useGlobalLoaderStore } from '@/stores/useGlobalLoader'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { EmailVerifier__factory, IRoyaltyAutoClaim__factory, RoyaltyAutoClaim__factory } from '@/typechain-v2'
import { Group } from '@semaphore-protocol/group'
import { useVueDapp } from '@vue-dapp/core'
import { concat } from 'ethers'
import {
	DUMMY_ECDSA_SIGNATURE,
	ENTRY_POINT_V08_ADDRESS,
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
import { getNonceV08, setFixedVerificationGasLimitForZkProof } from './erc4337-utils'
import { extractAndParseRevert, isUserRejectedError, normalizeError } from './error'
import {
	createSemaphoreIdentity,
	encodeSemaphoreProof,
	generateSemaphoreProof,
	makeDummySemaphoreProof,
} from './semaphore-utils'
import { generateEmailProof, makeDummyEmailProof, ParsedEmailData } from './zkemail-utils'

export function useContractCallV2<T extends unknown[] = []>(options: {
	getCalldata?: (...args: T) => string
	getEmailOperation?: (...args: T) => {
		eml: string
		parsedEmailData: ParsedEmailData | null
	}
	getSemaphoreOperation?: (...args: T) => {
		title: string
		royaltyLevel: number
	}
	getUseLocalProof?: () => boolean
	successTitle: string
	errorTitle: string
	onBeforeCall?: (...args: T) => Promise<void> | void
	onAfterCall?: (...args: T) => Promise<void> | void
}) {
	const blockchainStore = useBlockchainStore()
	const eoaStore = useEOAStore()
	const globalLoaderStore = useGlobalLoaderStore()

	const isLoading = ref(false)

	async function send(...args: T) {
		const client = blockchainStore.client
		const chainId = blockchainStore.chainId
		const senderAddress = blockchainStore.royaltyAutoClaimProxyAddress
		const pimlicoUrl = blockchainStore.pimlicoUrl
		const bundler = new ERC4337Bundler(pimlicoUrl, undefined, {
			batchMaxCount: 1,
		})
		const entryPointAddress = ENTRY_POINT_V08_ADDRESS

		try {
			isLoading.value = true
			globalLoaderStore.isGlobalLoading = true

			if (options.onBeforeCall) {
				await options.onBeforeCall(...args)
			}

			if (options.getEmailOperation) {
				/* -------------------------------------------------------------------------- */
				/*                              Email Operations                              */
				/* -------------------------------------------------------------------------- */
				const operationStartTime = performance.now()
				const emailOperation = options.getEmailOperation(...args)

				if (!emailOperation.parsedEmailData) {
					throw new Error('useContractCallV2: emailOperation.parsedEmailData is required')
				}

				if (!emailOperation.eml) {
					throw new Error('useContractCallV2: emailOperation.eml is required')
				}

				// Generate calldata based on operation type
				let callData: string
				const iface = IRoyaltyAutoClaim__factory.createInterface()
				if (emailOperation.parsedEmailData.operationType === 1) {
					callData = iface.encodeFunctionData('registerSubmission4337', [
						emailOperation.parsedEmailData.title,
						emailOperation.parsedEmailData.recipient,
						emailOperation.parsedEmailData.nullifier,
					])
				} else if (emailOperation.parsedEmailData.operationType === 2) {
					callData = iface.encodeFunctionData('updateRoyaltyRecipient4337', [
						emailOperation.parsedEmailData.title,
						emailOperation.parsedEmailData.recipient,
						emailOperation.parsedEmailData.nullifier,
					])
				} else {
					throw new Error(`Unknown email operation type: ${emailOperation.parsedEmailData.operationType}`)
				}

				// Build user op
				const op = new UserOpBuilder({ chainId, bundler, entryPointAddress })
					.setSender(senderAddress)
					.setNonce(await getNonceV08(senderAddress, client))
					.setCallData(callData)
					.setGasPrice(await fetchGasPricePimlico(pimlicoUrl))

				// Make dummy proof for gas estimation
				op.setSignature(await makeDummyEmailProof(emailOperation.eml))

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

				const proofStartTime = performance.now()
				const encodedProof = await generateEmailProof(emailOperation.eml, op.hash())
				const proofEndTime = performance.now()
				const proofDuration = Math.ceil((proofEndTime - proofStartTime) / 1000).toString()
				console.info(`Email proof generation took ${proofDuration}s`)

				op.setSignature(encodedProof)

				toast.dismiss(genProofToast)

				// send
				await sendAndWaitForUserOp(op, options.successTitle, proofDuration, operationStartTime)
			} else if (options.getSemaphoreOperation) {
				/* -------------------------------------------------------------------------- */
				/*                                  Semaphore                                 */
				/* -------------------------------------------------------------------------- */

				const semaphoreOperation = options.getSemaphoreOperation(...args)

				if (!eoaStore.signer) {
					throw new Error('Please connect your EOA wallet first')
				}

				// Create Semaphore identity from signer
				const genIdentityToast = toast.info('Creating Semaphore identity...', {
					duration: Infinity,
				})
				const identity = await createSemaphoreIdentity(eoaStore.signer)
				toast.dismiss(genIdentityToast)

				const operationStartTime = performance.now()

				// Fetch reviewer members from store
				const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
				await royaltyAutoClaimStore.fetchReviewerMembers()
				const members = royaltyAutoClaimStore.reviewerMembers

				console.log(members)

				// Create off-chain group from members
				const group = new Group(members)

				// Verify identity is in the group
				const isMember = members.some((member: bigint) => member === identity.commitment)
				if (!isMember) {
					throw new Error(
						'Your identity is not a member of the reviewer group. Please contact the admin to be added.',
					)
				}

				// Generate real Semaphore proof first
				const genProofToast = toast.info('Generating Semaphore proof...', {
					duration: Infinity,
				})

				const proofStartTime = performance.now()
				const semaphoreProof = await generateSemaphoreProof({
					identity,
					group,
					title: semaphoreOperation.title,
					royaltyLevel: semaphoreOperation.royaltyLevel,
				})
				const proofEndTime = performance.now()
				const proofDuration = Math.ceil((proofEndTime - proofStartTime) / 1000).toString()
				console.info(`Semaphore proof generation took ${proofDuration}s`)

				toast.dismiss(genProofToast)

				// Create dummy proof for gas estimation
				const dummyProofEncoded = makeDummySemaphoreProof(
					semaphoreProof.merkleTreeDepth,
					semaphoreProof.merkleTreeRoot,
					semaphoreProof.nullifier,
					semaphoreProof.message,
					semaphoreProof.scope,
				)

				const callData = IRoyaltyAutoClaim__factory.createInterface().encodeFunctionData(
					'reviewSubmission4337',
					[semaphoreOperation.title, semaphoreOperation.royaltyLevel, semaphoreProof.nullifier],
				)

				const op = new UserOpBuilder({
					chainId,
					bundler,
					entryPointAddress,
				})
					.setSender(senderAddress)
					.setNonce(await getNonceV08(senderAddress, client))
					.setCallData(callData)
					.setGasPrice(await fetchGasPricePimlico(pimlicoUrl))
					.setSignature(dummyProofEncoded)

				// Estimate gas
				try {
					await op.estimateGas()
				} catch (e) {
					console.info('handleOps', op.encodeHandleOpsDataWithDefaultGas())
					throw e
				}

				// Replace dummy proof with real proof
				const proofEncoded = encodeSemaphoreProof(semaphoreProof)
				op.setSignature(proofEncoded)

				// send
				await sendAndWaitForUserOp(op, options.successTitle, proofDuration, operationStartTime)
			} else {
				/* -------------------------------------------------------------------------- */
				/*                             EOA signature flow                             */
				/* -------------------------------------------------------------------------- */
				const { chainId: walletChainId, connector } = useVueDapp()

				if (walletChainId.value !== Number(chainId)) {
					await connector.value?.switchChain?.(Number(chainId))
				}

				if (!options.getCalldata) {
					throw new Error('useContractCall: getCalldata is required')
				}

				if (!eoaStore.signer) {
					throw new Error('Please connect your EOA wallet first')
				}

				// EOA signature flow
				const op = new UserOpBuilder({
					chainId,
					bundler,
					entryPointAddress,
				})
					.setSender(senderAddress)
					.setNonce(await getNonceV08(senderAddress, client))
					.setCallData(options.getCalldata(...args))
					.setGasPrice(await fetchGasPricePimlico(pimlicoUrl))
					.setSignature(concat([DUMMY_ECDSA_SIGNATURE, eoaStore.signer.address]))

				// Estimate gas
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
				await sendAndWaitForUserOp(op, options.successTitle)
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
					EmailVerifier: EmailVerifier__factory.createInterface(),
					IERC20Errors: IERC20Errors__factory.createInterface(),
				})
			}

			// Do not show error when the user cancels their action
			if (isUserRejectedError(e)) {
				return
			}

			toast.error(options.errorTitle, {
				description: revert || err.message,
				duration: Infinity,
			})
		} finally {
			globalLoaderStore.isGlobalLoading = false
			isLoading.value = false
		}
	}

	return {
		isLoading,
		send,
	}
}

async function sendAndWaitForUserOp(
	op: UserOpBuilder,
	successTitle: string,
	proofDurationSeconds?: string,
	operationStartTime?: number,
) {
	const blockchainStore = useBlockchainStore()

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

	const receipt = await op.wait()

	toast.dismiss(waitingToast)

	if (!receipt.success) {
		console.error('userOpReceipt', receipt)
		throw new Error('UserOp is failed')
	}

	const totalDuration = operationStartTime
		? Math.ceil((performance.now() - operationStartTime) / 1000).toString()
		: undefined

	const txLink = receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0]?.transactionHash
		? `${blockchainStore.explorerUrl}/tx/${
				receipt.logs.filter(log => isSameAddress(log.address, op.preview().sender))[0].transactionHash
		  }`
		: '#'

	toast.success(successTitle, {
		description: h('div', { class: 'flex flex-col gap-1' }, [
			proofDurationSeconds ? h('span', `Proof generated in ${proofDurationSeconds}s`) : null,
			totalDuration ? h('span', `Total time: ${totalDuration}s`) : null,
			h(
				'a',
				{
					class: 'text-blue-700 hover:underline cursor-pointer',
					href: txLink,
					target: '_blank',
				},
				'View on Explorer',
			),
		]),
		duration: Infinity,
	})
}
