<script setup lang="ts">
import { ERROR_NOTIFICATION_DURATION } from '@/config'
import { formatErrMsg, normalizeError } from '@/lib/error'
import { useContractCallV2 } from '@/lib/useContractCallV2'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { RoyaltyAutoClaim__factory } from '@/typechain-v2'
import { Contract, formatEther, parseEther } from 'ethers'
import { ArrowLeft } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const iface = RoyaltyAutoClaim__factory.createInterface()
const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

const isBtnDisabled = computed(
	() =>
		isRevokeLoading.value ||
		isAddReviewerLoading.value ||
		isRemoveReviewerLoading.value ||
		isChangeAdminLoading.value ||
		isChangeTokenLoading.value ||
		isEmergencyWithdrawLoading.value,
)

const currentAdmin = ref('')
const currentToken = ref('')

onMounted(async () => {
	currentAdmin.value = await royaltyAutoClaimStore.royaltyAutoClaim.admin()
	currentToken.value = await royaltyAutoClaimStore.royaltyAutoClaim.token()
})

// ===================================== Submission Management =====================================

const title = ref('')

// Revoke Submission
const { isLoading: isRevokeLoading, send: onClickRevokeSubmission } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('revokeSubmission', [title.value]),
	successTitle: 'Successfully Revoked Submission',
	errorTitle: 'Error Revoking Submission',
})

// ===================================== Reviewer Management =====================================

const reviewer = ref('')

// Add Reviewer
const { isLoading: isAddReviewerLoading, send: onClickAddReviewer } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('updateReviewers', [[reviewer.value], [true]]),
	successTitle: 'Successfully Added Reviewer',
	errorTitle: 'Error Adding Reviewer',
	onBeforeCall: async () => {
		const isReviewer = await royaltyAutoClaimStore.royaltyAutoClaim.isReviewer(reviewer.value)
		if (isReviewer) {
			throw new Error('Reviewer already exists')
		}
	},
})

// Remove Reviewer
const { isLoading: isRemoveReviewerLoading, send: onClickRemoveReviewer } = useContractCallV2({
	getCalldata: () => iface.encodeFunctionData('updateReviewers', [[reviewer.value], [false]]),
	successTitle: 'Successfully Removed Reviewer',
	errorTitle: 'Error Removing Reviewer',
	onBeforeCall: async () => {
		const isReviewer = await royaltyAutoClaimStore.royaltyAutoClaim.isReviewer(reviewer.value)
		if (!isReviewer) {
			throw new Error('Reviewer does not exist')
		}
	},
})

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
			duration: ERROR_NOTIFICATION_DURATION,
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
		<div class="flex justify-start mb-2">
			<RouterLink
				:to="{
					name: 'v2',
				}"
			>
				<Button size="icon" variant="ghost">
					<ArrowLeft />
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
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<Label for="submissionTitle">Submission Title</Label>
						<Input id="submissionTitle" v-model="title" placeholder="title" />
					</div>
					<div class="flex gap-4 flex-wrap">
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
			</CardContent>
		</Card>

		<Card class="mb-8">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Reviewer Management</CardTitle>
				</div>
				<CardDescription>onlyAdmin</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<Label for="reviewer">Reviewer Address</Label>
						<Input id="reviewer" v-model="reviewer" placeholder="0x..." />
					</div>
					<div class="flex gap-4">
						<Button
							variant="default"
							:loading="isAddReviewerLoading"
							:disabled="isBtnDisabled"
							@click="onClickAddReviewer"
						>
							Add Reviewer
						</Button>
						<Button
							variant="destructive"
							:loading="isRemoveReviewerLoading"
							:disabled="isBtnDisabled"
							@click="onClickRemoveReviewer"
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
						<Label>Current Admin</Label>
						<div class="text-sm text-muted-foreground break-all">
							<Address :address="currentAdmin" />
						</div>

						<Label for="admin" class="mt-4">New Admin</Label>
						<Input id="admin" v-model="newAdmin" placeholder="0x..." />
					</div>
					<Button :loading="isChangeAdminLoading" :disabled="isBtnDisabled" @click="onClickChangeAdmin">
						Change Admin
					</Button>

					<div class="flex flex-col space-y-1.5">
						<Label>Current Token</Label>
						<div class="text-sm text-muted-foreground break-all">
							<Address :address="currentToken" />
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
							<span class="font-normal"> {{ displayTokenAmount }} token </span>
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
