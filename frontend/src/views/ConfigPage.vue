<script setup lang="ts">
import { TENDERLY_RPC_URL } from '@/config'
import { formatErrMsg, isUserRejectedError, normalizeError, parseContractRevert } from '@/lib/error'
import { fetchReviewerGroupMembers, SEMAPHORE_ADDRESS } from '@/lib/semaphore-utils'
import { useSubmissionPolling } from '@/lib/submission-utils'
import { useContractCallV2 } from '@/lib/useContractCallV2'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { useEOAStore } from '@/stores/useEOA'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { ISemaphore__factory, ISemaphoreGroups__factory, RoyaltyAutoClaim__factory } from '@/typechain-v2'
import { Group } from '@semaphore-protocol/group'
import { useVueDapp } from '@vue-dapp/core'
import { Contract, ContractTransactionResponse, formatEther, Interface, parseEther } from 'ethers'
import { ArrowLeft, UserCircle } from 'lucide-vue-next'
import { isSameAddress } from 'sendop'
import { h } from 'vue'
import { toast } from 'vue-sonner'

const iface = RoyaltyAutoClaim__factory.createInterface()
const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
const blockchainStore = useBlockchainStore()
const eoaStore = useEOAStore()
const { chainId: walletChainId, connector } = useVueDapp()
const { isPollingForSubmissionUpdate, pollForSubmissionUpdate } = useSubmissionPolling()

// Semaphore contract instance
const semaphoreContract = computed(() => {
	if (!eoaStore.signer) {
		return ISemaphore__factory.connect(SEMAPHORE_ADDRESS, blockchainStore.client)
	}
	return ISemaphore__factory.connect(SEMAPHORE_ADDRESS, eoaStore.signer)
})

// Reviewer group ID
const reviewerGroupId = ref<bigint | null>(null)

// Input refs for reviewer management
const singleCommitment = ref('')
const batchCommitments = ref('')
const oldCommitment = ref('')
const newCommitment = ref('')
const removeCommitment = ref('')

// Loading states for reviewer operations
const isAddMemberLoading = ref(false)
const isAddMembersLoading = ref(false)
const isUpdateMemberLoading = ref(false)
const isRemoveMemberLoading = ref(false)

// Members list management
const membersList = ref<bigint[]>([])
const isFetchingMembers = ref(false)

const isAnyReviewerLoading = computed(
	() =>
		isAddMemberLoading.value ||
		isAddMembersLoading.value ||
		isUpdateMemberLoading.value ||
		isRemoveMemberLoading.value,
)

const isBtnDisabled = computed(
	() =>
		isRevokeLoading.value ||
		isAdminRegisterLoading.value ||
		isAdminUpdateRecipientLoading.value ||
		isRevokeEmailLoading.value ||
		isChangeAdminLoading.value ||
		isChangeTokenLoading.value ||
		isEmergencyWithdrawLoading.value ||
		isAnyReviewerLoading.value ||
		isPollingForSubmissionUpdate.value,
)

const currentAdmin = ref('')
const currentToken = ref('')

onMounted(async () => {
	currentAdmin.value = await royaltyAutoClaimStore.royaltyAutoClaim.admin()
	currentToken.value = await royaltyAutoClaimStore.royaltyAutoClaim.token()
	reviewerGroupId.value = await royaltyAutoClaimStore.royaltyAutoClaim.reviewerGroupId()

	// Load members list
	try {
		isFetchingMembers.value = true
		membersList.value = await fetchMembers()
	} catch (e: unknown) {
		const err = normalizeError(e)
		console.error('Error loading members:', err)
		toast.error('Error Loading Members', {
			description: formatErrMsg(err),
			duration: Infinity,
		})
	} finally {
		isFetchingMembers.value = false
	}
})

// ===================================== Submission Management =====================================

const title = ref('')
const recipientAddress = ref('')
const emailNumber = ref('')

// Admin Register Submission
const { isLoading: isAdminRegisterLoading, send: onClickAdminRegister } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('adminRegisterSubmission', [title.value, recipientAddress.value]),
	successTitle: 'Successfully Registered Submission',
	errorTitle: 'Error Registering Submission',
	onBeforeCall: async () => {
		// Validate address format
		if (!/^0x[a-fA-F0-9]{40}$/i.test(recipientAddress.value)) {
			throw new Error('Invalid recipient address format')
		}
		// Check if submission already exists
		const existing = royaltyAutoClaimStore.submissions.find(s => s.title === title.value)

		if (existing && existing.status !== null) {
			throw new Error('Submission already exists')
		}
	},
	onAfterCall: async () => {
		// Poll for submission registration
		await pollForSubmissionUpdate(title.value, submission => {
			return isSameAddress(submission.recipient, recipientAddress.value) && submission.status === 'registered'
		})
		// Clear inputs
		title.value = ''
		recipientAddress.value = ''
	},
})

// Admin Update Royalty Recipient
const { isLoading: isAdminUpdateRecipientLoading, send: onClickAdminUpdateRecipient } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('adminUpdateRoyaltyRecipient', [title.value, recipientAddress.value]),
	successTitle: 'Successfully Updated Recipient',
	errorTitle: 'Error Updating Recipient',
	onBeforeCall: async () => {
		// Validate address format
		if (!/^0x[a-fA-F0-9]{40}$/i.test(recipientAddress.value)) {
			throw new Error('Invalid recipient address format')
		}
		// Check submission exists
		const submission = royaltyAutoClaimStore.submissions.find(s => s.title === title.value)
		if (!submission || submission.status !== 'registered') {
			throw new Error('Submission not found or not in registered status')
		}
		// Check not same as current
		if (isSameAddress(submission.recipient, recipientAddress.value)) {
			throw new Error('New recipient is the same as current recipient')
		}
	},
	onAfterCall: async () => {
		// Poll for recipient update
		await pollForSubmissionUpdate(title.value, submission => {
			return isSameAddress(submission.recipient, recipientAddress.value)
		})
		// Clear inputs
		title.value = ''
		recipientAddress.value = ''
	},
})

// Revoke Email
const { isLoading: isRevokeEmailLoading, send: onClickRevokeEmail } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('revokeEmail', [emailNumber.value]),
	successTitle: 'Successfully Revoked Email',
	errorTitle: 'Error Revoking Email',
	onBeforeCall: async () => {
		// Validate number is positive integer
		const num = parseInt(emailNumber.value)
		if (isNaN(num) || num < 0) {
			throw new Error('Email number must be a non-negative integer')
		}
	},
	onAfterCall: async () => {
		// Clear input
		emailNumber.value = ''
	},
})

// Revoke Submission
const { isLoading: isRevokeLoading, send: onClickRevokeSubmission } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('revokeSubmission', [title.value]),
	successTitle: 'Successfully Revoked Submission',
	errorTitle: 'Error Revoking Submission',
})

// ===================================== Reviewer Management =====================================

// Validation functions
function validateIdentityCommitment(input: string): bigint {
	const trimmed = input.trim()
	if (!trimmed) {
		throw new Error('Identity commitment cannot be empty')
	}
	try {
		const value = BigInt(trimmed)
		if (value < 0n || value > 2n ** 256n - 1n) {
			throw new Error('Identity commitment must be a valid uint256')
		}
		return value
	} catch {
		throw new Error('Invalid identity commitment format. Must be a valid decimal string.')
	}
}

function validateIdentityCommitments(input: string): bigint[] {
	const lines = input
		.split('\n')
		.map(line => line.trim())
		.filter(line => line.length > 0)
	if (lines.length === 0) {
		throw new Error('Please enter at least one identity commitment')
	}
	return lines.map((line, index) => {
		try {
			return validateIdentityCommitment(line)
		} catch (e) {
			throw new Error(`Line ${index + 1}: ${(e as Error).message}`)
		}
	})
}

// Fetch all members using SemaphoreEthers
async function fetchMembers(): Promise<bigint[]> {
	if (!reviewerGroupId.value) {
		throw new Error('Reviewer group ID not loaded')
	}

	const rpcUrl = TENDERLY_RPC_URL[blockchainStore.chainId]
	if (!rpcUrl) {
		throw new Error(`RPC URL not configured for chain ${blockchainStore.chainId}`)
	}

	// Fetch members using SemaphoreEthers
	const members = await fetchReviewerGroupMembers({
		rpcUrl,
		semaphoreAddress: SEMAPHORE_ADDRESS,
		groupId: reviewerGroupId.value.toString(),
	})

	if (!members) {
		throw new Error('Failed to fetch group members')
	}

	return members.map(m => BigInt(m))
}

// Reload members list
async function reloadMembers() {
	try {
		membersList.value = await fetchMembers()
	} catch (e: unknown) {
		const err = normalizeError(e)
		console.error('Error reloading members:', err)
	}
}

// Merkle proof generation
async function generateMerkleProofSiblings(identityCommitment: bigint): Promise<bigint[]> {
	membersList.value = await fetchMembers()

	// Create off-chain group for merkle proof generation
	const group = new Group(membersList.value)

	// Find member index
	const index = group.indexOf(identityCommitment)
	if (index === -1) {
		throw new Error('Identity commitment not found in reviewer group')
	}

	// Generate merkle proof using Semaphore library
	const proof = group.generateMerkleProof(index)
	return proof.siblings.map(s => BigInt(s))
}

// Direct contract call helper
async function executeDirectContractCall(options: {
	operation: () => Promise<ContractTransactionResponse>
	successTitle: string
	errorTitle: string
	onAfterCall?: () => void
}) {
	const { operation, successTitle, errorTitle, onAfterCall } = options

	try {
		if (!eoaStore.signer) {
			throw new Error('Please connect your admin wallet first')
		}

		// Switch chain if needed
		if (walletChainId.value !== Number(blockchainStore.chainId)) {
			await connector.value?.switchChain?.(Number(blockchainStore.chainId))
		}

		const tx = await operation()

		const waitingToast = toast.info('Waiting for transaction confirmation...', {
			duration: Infinity,
		})

		const receipt = await tx.wait()
		toast.dismiss(waitingToast)

		if (!receipt) {
			throw new Error('Transaction receipt not found')
		}

		const txLink = `${blockchainStore.explorerUrl}/tx/${receipt.hash}`
		toast.success(successTitle, {
			description: h(
				'a',
				{ class: 'text-blue-700 hover:underline cursor-pointer', href: txLink, target: '_blank' },
				'View on Explorer',
			),
			duration: Infinity,
		})

		onAfterCall?.()
	} catch (e: unknown) {
		console.error('Error in executeDirectContractCall:', e)
		const err = normalizeError(e)

		if (isUserRejectedError(e)) {
			console.log('User rejected the transaction')
			return
		}

		// Try to extract and parse Semaphore contract revert
		let errorDescription = err.message || 'An unknown error occurred'
		try {
			// Extract revert data from error.data or error message
			let revertData = ''

			// First check if error object has a data property
			if (typeof e === 'object' && e !== null && 'data' in e) {
				const errorData = (e as Record<string, unknown>).data
				console.log('errorData', errorData)
				if (typeof errorData === 'string' && errorData.startsWith('0x')) {
					revertData = errorData
				}
			}

			// Fallback to extracting hex string from error message
			if (!revertData) {
				const hexMatch = err.message.match(/(0x[a-fA-F0-9]+)/)
				revertData = hexMatch?.[1] || ''
			}

			if (revertData) {
				const parsedError = parseContractRevert(revertData, {
					ISemaphore: ISemaphore__factory.createInterface(),
					ISemaphoreGroups__factory: ISemaphoreGroups__factory.createInterface(),
					InternalLeanIMT: new Interface([
						'error WrongSiblingNodes()',
						'error LeafGreaterThanSnarkScalarField()',
						'error LeafCannotBeZero()',
						'error LeafAlreadyExists()',
						'error LeafDoesNotExist()',
					]),
				})
				if (parsedError) {
					errorDescription = parsedError
					console.info({
						[revertData]: parsedError,
					})
				}
			}
		} catch (parseError) {
			console.warn('Failed to parse contract revert:', parseError)
		}

		toast.error(errorTitle, {
			description: errorDescription,
			duration: Infinity,
		})
	}
}

// Add single member
async function onClickAddMember() {
	if (!reviewerGroupId.value) {
		toast.error('Error', { description: 'Reviewer group ID not loaded' })
		return
	}

	isAddMemberLoading.value = true
	try {
		await executeDirectContractCall({
			operation: async () => {
				const commitment = validateIdentityCommitment(singleCommitment.value)

				// Validate off-chain: check if commitment already exists
				const members = await fetchMembers()
				if (members.some(m => m === commitment)) {
					throw new Error('Identity commitment already exists in the reviewer group')
				}

				return await semaphoreContract.value.addMember(reviewerGroupId.value!, commitment)
			},
			successTitle: 'Successfully Added Reviewer',
			errorTitle: 'Error Adding Reviewer',
			onAfterCall: () => {
				singleCommitment.value = ''
				reloadMembers()
			},
		})
	} finally {
		isAddMemberLoading.value = false
	}
}

// Add multiple members (batch)
async function onClickAddMembers() {
	if (!reviewerGroupId.value) {
		toast.error('Error', { description: 'Reviewer group ID not loaded' })
		return
	}

	isAddMembersLoading.value = true
	try {
		await executeDirectContractCall({
			operation: async () => {
				const commitments = validateIdentityCommitments(batchCommitments.value)

				// Validate off-chain: check if any commitment already exists
				const members = await fetchMembers()
				const existingCommitments = commitments.filter(c => members.some(m => m === c))
				if (existingCommitments.length > 0) {
					throw new Error(`${existingCommitments.length} commitment(s) already exist in the reviewer group`)
				}

				return await semaphoreContract.value.addMembers(reviewerGroupId.value!, commitments)
			},
			successTitle: `Successfully Added Reviewers`,
			errorTitle: 'Error Adding Reviewers',
			onAfterCall: () => {
				batchCommitments.value = ''
				reloadMembers()
			},
		})
	} finally {
		isAddMembersLoading.value = false
	}
}

// Update member
async function onClickUpdateMember() {
	if (!reviewerGroupId.value) {
		toast.error('Error', { description: 'Reviewer group ID not loaded' })
		return
	}

	isUpdateMemberLoading.value = true
	try {
		await executeDirectContractCall({
			operation: async () => {
				const oldCommitmentValue = validateIdentityCommitment(oldCommitment.value)
				const newCommitmentValue = validateIdentityCommitment(newCommitment.value)

				// Validate off-chain
				const members = await fetchMembers()
				if (!members.some(m => m === oldCommitmentValue)) {
					throw new Error('Old identity commitment not found in the reviewer group')
				}
				if (members.some(m => m === newCommitmentValue)) {
					throw new Error('New identity commitment already exists in the reviewer group')
				}

				const siblings = await generateMerkleProofSiblings(oldCommitmentValue)

				return await semaphoreContract.value.updateMember(
					reviewerGroupId.value!,
					oldCommitmentValue,
					newCommitmentValue,
					siblings,
				)
			},
			successTitle: 'Successfully Updated Reviewer',
			errorTitle: 'Error Updating Reviewer',
			onAfterCall: () => {
				oldCommitment.value = ''
				newCommitment.value = ''
				reloadMembers()
			},
		})
	} finally {
		isUpdateMemberLoading.value = false
	}
}

// Remove member
async function onClickRemoveMember() {
	if (!reviewerGroupId.value) {
		toast.error('Error', { description: 'Reviewer group ID not loaded' })
		return
	}

	isRemoveMemberLoading.value = true
	try {
		await executeDirectContractCall({
			operation: async () => {
				const commitment = validateIdentityCommitment(removeCommitment.value)

				// Validate off-chain: check if commitment exists
				const members = await fetchMembers()
				if (!members.some(m => m === commitment)) {
					throw new Error('Identity commitment not found in the reviewer group')
				}

				const siblings = await generateMerkleProofSiblings(commitment)

				return await semaphoreContract.value.removeMember(reviewerGroupId.value!, commitment, siblings)
			},
			successTitle: 'Successfully Removed Reviewer',
			errorTitle: 'Error Removing Reviewer',
			onAfterCall: () => {
				removeCommitment.value = ''
				reloadMembers()
			},
		})
	} finally {
		isRemoveMemberLoading.value = false
	}
}

// ===================================== Admin Management =====================================

const newAdmin = ref('')
const newToken = ref('')

// Change Admin
const { isLoading: isChangeAdminLoading, send: onClickChangeAdmin } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('changeAdmin', [newAdmin.value]),
	successTitle: 'Successfully Changed Admin',
	errorTitle: 'Error Changing Admin',
	onBeforeCall: async () => {
		if (newAdmin.value === currentAdmin.value) {
			throw new Error('New admin is the same as the current admin')
		}
	},
	onAfterCall: async () => {
		currentAdmin.value = await royaltyAutoClaimStore.royaltyAutoClaim.admin()
	},
})

// Change Token
const { isLoading: isChangeTokenLoading, send: onClickChangeToken } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('changeRoyaltyToken', [newToken.value]),
	successTitle: 'Successfully Changed Token',
	errorTitle: 'Error Changing Token',
	onBeforeCall: async () => {
		if (newToken.value === currentToken.value) {
			throw new Error('New token is the same as the current token')
		}
	},
	onAfterCall: async () => {
		currentToken.value = await royaltyAutoClaimStore.royaltyAutoClaim.token()
	},
})

// ===================================== Emergency Withdraw =====================================

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const withdrawToken = ref(NATIVE_TOKEN)
const withdrawAmount = ref<string>('0')

// Emergency Withdraw
const { isLoading: isEmergencyWithdrawLoading, send: onClickEmergencyWithdraw } = useContractCallV2({
	getCalldata: () =>
		iface.encodeFunctionData('emergencyWithdraw', [withdrawToken.value, withdrawAmount.value.toString()]),
	successTitle: 'Successfully Withdrew Tokens',
	errorTitle: 'Error Withdrawing Tokens',
	onBeforeCall: async () => {
		if (parseEther(withdrawAmount.value.toString()) <= 0) {
			throw new Error('Amount must be greater than 0')
		}
	},
})

const isMaxBtnDisabled = ref(false)

const onClickMax = useThrottleFn(async () => {
	const blockchainStore = useBlockchainStore()
	const client = blockchainStore.client

	if (!withdrawToken.value) {
		withdrawAmount.value = '0'
		return
	}

	try {
		isMaxBtnDisabled.value = true
		if (withdrawToken.value === NATIVE_TOKEN) {
			const balance = await client.getBalance(royaltyAutoClaimStore.royaltyAutoClaim.getAddress())
			withdrawAmount.value = balance.toString()
		} else {
			const erc20 = new Contract(
				withdrawToken.value,
				['function balanceOf(address) view returns (uint256)'],
				client,
			)
			const balance: bigint = await erc20.balanceOf(royaltyAutoClaimStore.royaltyAutoClaim.getAddress())
			withdrawAmount.value = balance.toString()
		}
	} catch (e: unknown) {
		withdrawAmount.value = '0'
		const err = normalizeError(e)
		console.error(err)
		toast.error('Error Fetching Balance', {
			description: formatErrMsg(err),
			duration: Infinity,
		})
	} finally {
		isMaxBtnDisabled.value = false
	}
}, 1000)

const displayTokenAmount = computed(() => {
	try {
		return formatEther(BigInt(withdrawAmount.value))
	} catch {
		return '0'
	}
})
</script>

<template>
	<div class="container mx-auto p-8 max-w-2xl">
		<div class="flex justify-between items-center mb-2">
			<RouterLink
				:to="{
					name: 'v2',
				}"
			>
				<Button size="icon" variant="ghost">
					<ArrowLeft />
				</Button>
			</RouterLink>

			<RouterLink :to="{ name: 'identity' }">
				<Button size="icon" variant="ghost">
					<UserCircle />
				</Button>
			</RouterLink>
		</div>

		<Card class="mb-8">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Submission Management</CardTitle>
				</div>
				<CardDescription>onlyAdmin</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-6">
					<!-- Admin Register Submission -->
					<div class="space-y-2">
						<Label class="text-base font-semibold">Register Submission</Label>
						<div class="flex flex-col space-y-1.5">
							<Label for="registerTitle">Title</Label>
							<Input id="registerTitle" v-model="title" placeholder="Submission title" />

							<Label for="registerRecipient">Recipient Address</Label>
							<Input id="registerRecipient" v-model="recipientAddress" placeholder="0x..." />
						</div>

						<div class="flex flex-wrap gap-2">
							<Button
								:loading="isAdminRegisterLoading"
								:disabled="isBtnDisabled || !title || !recipientAddress"
								@click="onClickAdminRegister"
							>
								Register Submission
							</Button>

							<Button
								:loading="isAdminUpdateRecipientLoading"
								:disabled="isBtnDisabled || !title || !recipientAddress"
								@click="onClickAdminUpdateRecipient"
							>
								Update Recipient
							</Button>

							<Button
								variant="destructive"
								:loading="isRevokeLoading"
								:disabled="isBtnDisabled || !title"
								@click="onClickRevokeSubmission"
							>
								Revoke Submission
							</Button>
						</div>
					</div>

					<hr class="border-border" />

					<!-- Revoke Email -->
					<div class="space-y-2">
						<Label class="text-base font-semibold">Revoke Email</Label>
						<div class="flex flex-col space-y-1.5">
							<Label for="emailNumber">Email Number</Label>
							<Input
								id="emailNumber"
								v-model="emailNumber"
								type="number"
								placeholder="Email number to revoke"
							/>
						</div>
						<Button
							variant="destructive"
							:loading="isRevokeEmailLoading"
							:disabled="isBtnDisabled || !emailNumber"
							@click="onClickRevokeEmail"
						>
							Revoke Email
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="mb-8">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Reviewer Management (Semaphore)</CardTitle>
				</div>
				<CardDescription>onlyAdmin</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-6">
					<!-- Members List -->
					<div class="space-y-2">
						<div class="p-4 border rounded-md bg-muted/50">
							<div class="flex items-center justify-between mb-2">
								<Label class="text-base font-semibold">Current Members</Label>
								<span class="text-sm text-muted-foreground">
									{{ isFetchingMembers ? 'Loading...' : `${membersList.length} member(s)` }}
								</span>
							</div>
							<div v-if="isFetchingMembers" class="text-sm text-muted-foreground">Loading members...</div>
							<div v-else-if="membersList.length === 0" class="text-sm text-muted-foreground">
								No members found
							</div>
							<div v-else class="space-y-1 max-h-60 overflow-y-auto">
								<div
									v-for="(member, index) in membersList"
									:key="index"
									class="text-sm font-mono break-all p-2 bg-background rounded border"
								>
									{{ member.toString() }}
								</div>
							</div>
						</div>
					</div>

					<hr class="border-border" />

					<!-- Add Single Member -->
					<div class="space-y-2">
						<Label class="text-base font-semibold">Add Single Reviewer</Label>
						<div class="flex flex-col space-y-1.5">
							<Label for="singleCommitment">Identity Commitment (uint256)</Label>
							<Input id="singleCommitment" v-model="singleCommitment" placeholder="1234567890..." />
						</div>
						<Button
							variant="default"
							:loading="isAddMemberLoading"
							:disabled="!singleCommitment || isBtnDisabled"
							@click="onClickAddMember"
						>
							Add Reviewer
						</Button>
					</div>

					<hr class="border-border" />

					<!-- Add Multiple Members (Batch) -->
					<div class="space-y-2">
						<Label class="text-base font-semibold">Add Multiple Reviewers (Batch)</Label>
						<div class="flex flex-col space-y-1.5">
							<Label for="batchCommitments">Identity Commitments (one per line)</Label>
							<textarea
								id="batchCommitments"
								v-model="batchCommitments"
								placeholder="1234567890...&#10;9876543210...&#10;..."
								rows="4"
								class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>
						<Button
							variant="default"
							:loading="isAddMembersLoading"
							:disabled="!batchCommitments || isBtnDisabled"
							@click="onClickAddMembers"
						>
							Add Reviewers (Batch)
						</Button>
					</div>

					<hr class="border-border" />

					<!-- Update Member -->
					<div class="space-y-2">
						<Label class="text-base font-semibold">Update Reviewer</Label>
						<div class="flex flex-col space-y-1.5">
							<Label for="oldCommitment">Old Identity Commitment</Label>
							<Input id="oldCommitment" v-model="oldCommitment" placeholder="1234567890..." />
							<Label for="newCommitment" class="mt-2">New Identity Commitment</Label>
							<Input id="newCommitment" v-model="newCommitment" placeholder="1234567890..." />
						</div>
						<Button
							variant="default"
							:loading="isUpdateMemberLoading"
							:disabled="!oldCommitment || !newCommitment || isBtnDisabled"
							@click="onClickUpdateMember"
						>
							Update Reviewer
						</Button>
					</div>

					<hr class="border-border" />

					<!-- Remove Member -->
					<div class="space-y-2">
						<Label class="text-base font-semibold">Remove Reviewer</Label>
						<div class="flex flex-col space-y-1.5">
							<Label for="removeCommitment">Identity Commitment</Label>
							<Input id="removeCommitment" v-model="removeCommitment" placeholder="1234567890..." />
						</div>
						<Button
							variant="destructive"
							:loading="isRemoveMemberLoading"
							:disabled="!removeCommitment || isBtnDisabled"
							@click="onClickRemoveMember"
						>
							Remove Reviewer
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="mb-8">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Admin Management</CardTitle>
				</div>
				<CardDescription>onlyOwner</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<div class="flex items-center gap-2">
							<Label>Current Admin:</Label>
							<Address :address="currentAdmin" class="text-muted-foreground" />
						</div>

						<Label for="admin" class="mt-4">New Admin</Label>
						<Input id="admin" v-model="newAdmin" placeholder="0x..." />
					</div>
					<Button :loading="isChangeAdminLoading" :disabled="isBtnDisabled" @click="onClickChangeAdmin">
						Change Admin
					</Button>

					<div class="flex flex-col space-y-1.5">
						<div class="flex items-center gap-2">
							<Label>Current Token:</Label>
							<Address :address="currentToken" class="text-muted-foreground" />
						</div>

						<Label for="token" class="mt-4">New Token</Label>
						<Input id="token" v-model="newToken" placeholder="0x..." />
					</div>
					<Button :loading="isChangeTokenLoading" :disabled="isBtnDisabled" @click="onClickChangeToken">
						Change Token
					</Button>
				</div>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Emergency Withdraw</CardTitle>
				</div>
				<CardDescription>onlyOwner</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<Label for="withdrawToken">Token</Label>
						<Input id="withdrawToken" v-model="withdrawToken" placeholder="0x..." />
					</div>
					<div class="flex flex-col space-y-1.5">
						<Label for="amount">
							Amount:
							<span class="font-normal"> {{ displayTokenAmount }} </span>
						</Label>
						<div class="flex gap-2">
							<Input id="amount" v-model="withdrawAmount" placeholder="wei" />
							<Button variant="outline" class="h-10" :disabled="isMaxBtnDisabled" @click="onClickMax">
								Max
							</Button>
						</div>
					</div>
					<Button
						variant="destructive"
						:loading="isEmergencyWithdrawLoading"
						:disabled="isBtnDisabled"
						@click="onClickEmergencyWithdraw"
					>
						Emergency Withdraw
					</Button>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
