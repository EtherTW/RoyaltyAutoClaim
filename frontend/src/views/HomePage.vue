<script setup lang="ts">
import { useCountdownTimer } from '@/lib/useCountdownTimer'
import { useSubmissionPolling } from '@/lib/submission-utils'
import { useContractCallV2 } from '@/lib/useContractCallV2'
import { ParsedEmailData } from '@/lib/zkemail-utils'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { useGlobalLoaderStore } from '@/stores/useGlobalLoader'
import { Submission, useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { Edit, Loader2, Settings, X } from 'lucide-vue-next'
import { isSameAddress } from 'sendop'
import { toast } from 'vue-sonner'
import { parseEmail } from '@/lib/circuit-utils'

const router = useRouter()
const globalLoaderStore = useGlobalLoaderStore()
const { isPollingForSubmissionUpdate, pollForSubmissionUpdate } = useSubmissionPolling()

const isButtonDisabled = computed(
	() => isSubmitReviewLoading.value || isClaimRoyaltyLoading.value || globalLoaderStore.isGlobalLoading,
)

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
const blockchainStore = useBlockchainStore()

onMounted(async () => {
	if (!blockchainStore.royaltyAutoClaimProxyAddress) {
		console.error('RoyaltyAutoClaim address not set')
		blockchainStore.setIsTestnet(true)
		if (!blockchainStore.royaltyAutoClaimProxyAddress) {
			console.error('RoyaltyAutoClaim address not set after setting to testnet, redirecting to v1')
			toast.info('v2 is not ready yet, redirecting to v1')
			router.replace({ name: 'v1' })
		} else {
			window.location.reload()
		}
		return
	}

	await royaltyAutoClaimStore.fetchSubmissions()
	await royaltyAutoClaimStore.fetchReviewerMembers()
})

/* -------------------------------------------------------------------------- */
/*                              Email Operations                              */
/* -------------------------------------------------------------------------- */

const fileInputRef = ref<HTMLInputElement | null>(null)
const showUploadCard = ref(false)
const uploadedFile = ref<File | null>(null)
const fileContent = ref('')
const parsedEmailData = ref<ParsedEmailData | null>(null)
const parseError = ref<string | null>(null)
const isParsingEmail = ref(false)

function toggleUploadCard() {
	showUploadCard.value = !showUploadCard.value
	if (!showUploadCard.value) {
		// Reset form when closing
		uploadedFile.value = null
		fileContent.value = ''
		parsedEmailData.value = null
		parseError.value = null
		isParsingEmail.value = false
	}
}

async function handleFileUpload(event: Event) {
	const target = event.target as HTMLInputElement
	const file = target.files?.[0]
	if (!file) return

	uploadedFile.value = file
	parseError.value = null
	parsedEmailData.value = null

	const reader = new FileReader()
	reader.onload = async e => {
		const text = e.target?.result as string
		fileContent.value = text

		isParsingEmail.value = true
		useGlobalLoaderStore().isGlobalLoading = true
		try {
			parsedEmailData.value = await parseEmail(text)
		} catch (error) {
			parseError.value = error instanceof Error ? error.message : 'Failed to parse email'
			console.error('Error parsing email:', error)
		} finally {
			isParsingEmail.value = false
			useGlobalLoaderStore().isGlobalLoading = false
		}
	}
	reader.readAsText(file)
}

// Register Submission Timer
const {
	countdown: registerSubmissionCountdown,
	startTimer: startRegisterSubmissionTimer,
	stopTimer: stopRegisterSubmissionTimer,
	timerDisplay: registerSubmissionTimerDisplay,
} = useCountdownTimer()

// Register Submission
const { isLoading: isRegisterSubmissionLoading, send: onClickRegisterSubmission } = useContractCallV2({
	getEmailOperation: (_title: string) => ({
		eml: fileContent.value,
		parsedEmailData: parsedEmailData.value,
	}),
	successTitle: 'Successfully Registered Submission',
	errorTitle: 'Error Registering Submission',
	onBeforeCall: async () => {
		startRegisterSubmissionTimer()
	},
	onAfterCall: async (title: string) => {
		await pollForSubmissionUpdate(title)
		stopRegisterSubmissionTimer()
	},
})

// Update Recipient Timer
const {
	countdown: updateRecipientCountdown,
	startTimer: startUpdateRecipientTimer,
	stopTimer: stopUpdateRecipientTimer,
	timerDisplay: updateRecipientTimerDisplay,
} = useCountdownTimer()

// Update Recipient
const { isLoading: isUpdateRecipientLoading, send: onClickUpdateRecipient } = useContractCallV2({
	getEmailOperation: (_title: string, _recipient: string) => ({
		eml: fileContent.value,
		parsedEmailData: parsedEmailData.value,
	}),
	successTitle: 'Successfully Updated Recipient',
	errorTitle: 'Error Updating Recipient',
	onBeforeCall: async () => {
		startUpdateRecipientTimer()
	},
	onAfterCall: async (title: string, recipient: string) => {
		await pollForSubmissionUpdate(title, submission => {
			// For recipient updates, verify the recipient was actually updated
			if (!recipient) {
				return true // Can't verify, but submission exists
			}
			return isSameAddress(submission.recipient, recipient)
		})
		stopUpdateRecipientTimer()
	},
})

// ===================================== submit review & claim royalty =====================================

const ROYALTY_LEVELS = [
	{ value: '20', label: '20' },
	{ value: '40', label: '40' },
	{ value: '60', label: '60' },
	{ value: '80', label: '80' },
]

const selectedRoyaltyLevel = ref<'20' | '40' | '60' | '80'>('20')
const submissionBeingOperated = ref<string | null>(null)

// Submit Review
const { isLoading: isSubmitReviewLoading, send: onClickSubmitReview } = useContractCallV2({
	getSemaphoreOperation: (submissionTitle: string) => ({
		title: submissionTitle,
		royaltyLevel: Number(selectedRoyaltyLevel.value),
	}),
	successTitle: 'Successfully Submitted Review',
	errorTitle: 'Error Submitting Review',
	onBeforeCall: async (submissionTitle: string) => {
		submissionBeingOperated.value = submissionTitle
	},
	onAfterCall: async (submissionTitle: string) => {
		// Store the previous values to verify the update
		const previousSubmission = royaltyAutoClaimStore.submissions.find(s => s.title === submissionTitle)
		const previousReviewCount = previousSubmission?.reviewCount ?? 0
		const previousTotalRoyaltyLevel = previousSubmission?.totalRoyaltyLevel ?? 0

		await pollForSubmissionUpdate(submissionTitle, submission => {
			// Verify that review count and total royalty level have been updated
			return (
				(submission.reviewCount ?? 0) > previousReviewCount &&
				(submission.totalRoyaltyLevel ?? 0) > previousTotalRoyaltyLevel
			)
		})
	},
})

// Claim Royalty
const { isLoading: isClaimRoyaltyLoading, send: onClickClaimRoyalty } = useContractCallV2({
	getCalldata: (submissionTitle: string) =>
		royaltyAutoClaimStore.royaltyAutoClaim.interface.encodeFunctionData('claimRoyalty', [submissionTitle]),
	successTitle: 'Successfully Claimed Royalty',
	errorTitle: 'Error Claiming Royalty',
	onBeforeCall: async (submissionTitle: string) => {
		submissionBeingOperated.value = submissionTitle
	},
	onAfterCall: async (submissionTitle: string) => {
		await pollForSubmissionUpdate(submissionTitle, submission => {
			// Verify that status has changed to 'claimed'
			return submission.status === 'claimed'
		})
	},
})

function getAvgRoyaltyLevel(submission: Submission) {
	if (!submission.reviewCount || !submission.totalRoyaltyLevel) {
		return null
	}
	return submission.totalRoyaltyLevel / submission.reviewCount
}

function isSubmittingReview(submissionTitle: string) {
	return isSubmitReviewLoading.value && submissionBeingOperated.value === submissionTitle
}

function isClaimingRoyalty(submissionTitle: string) {
	return isClaimRoyaltyLoading.value && submissionBeingOperated.value === submissionTitle
}

const reversedSubmissions = computed(() => [...royaltyAutoClaimStore.submissions].reverse())
</script>

<template>
	<div class="container mx-auto p-8 max-w-2xl">
		<div class="flex justify-between items-center mb-2">
			<Button
				v-if="!showUploadCard"
				@click="toggleUploadCard"
				size="sm"
				variant="ghost"
				:disabled="isButtonDisabled"
			>
				<Edit :size="16" />
				<div>Email Operations</div>
			</Button>

			<Button v-else @click="toggleUploadCard" size="sm" variant="ghost" :disabled="isButtonDisabled">
				<X :size="16" />
				<div>Close</div>
			</Button>

			<Button
				size="icon"
				variant="ghost"
				:disabled="isButtonDisabled"
				@click="router.push({ name: 'v2-config' })"
			>
				<Settings />
			</Button>
		</div>

		<!-- Email Upload Section -->
		<Card v-if="showUploadCard" class="mb-6">
			<CardContent class="pt-6">
				<div class="flex flex-col gap-3">
					<div class="flex items-center">
						<div class="flex items-center gap-3 flex-1">
							<input
								ref="fileInputRef"
								type="file"
								@change="handleFileUpload"
								accept=".eml"
								class="hidden"
							/>
							<Button
								@click="() => fileInputRef?.click()"
								:disabled="isParsingEmail || isButtonDisabled"
								variant="default"
								size="sm"
							>
								Upload Email
							</Button>
							<span v-if="uploadedFile" class="text-sm text-muted-foreground truncate">
								Filename: {{ uploadedFile.name }}
							</span>
						</div>
					</div>

					<div
						v-if="isParsingEmail"
						class="text-xs text-muted-foreground bg-muted px-3 py-2 rounded flex items-center gap-2"
					>
						<Loader2 :size="14" class="animate-spin" />
						Parsing email...
					</div>
					<div v-if="parseError" class="text-xs text-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 rounded">
						Error: {{ parseError }}
					</div>
					<div v-if="parsedEmailData" class="space-y-2 text-xs bg-muted px-3 py-3 rounded">
						<div class="grid gap-1.5">
							<div>
								<span class="text-muted-foreground">Title: </span>
								<span class="text-foreground">{{ parsedEmailData.title }}</span>
							</div>
							<div>
								<span class="text-muted-foreground">Recipient: </span>
								<span class="text-foreground font-mono break-all">{{ parsedEmailData.recipient }}</span>
							</div>
						</div>
					</div>
					<Button
						v-if="parsedEmailData && parsedEmailData.operationType === 1"
						:loading="isRegisterSubmissionLoading"
						:disabled="isRegisterSubmissionLoading || isParsingEmail || isButtonDisabled"
						@click="onClickRegisterSubmission(parsedEmailData.title)"
					>
						Register Submission
						<span
							v-if="isRegisterSubmissionLoading"
							:class="{ 'text-red-500': registerSubmissionCountdown <= 0 }"
						>
							&nbsp;{{ registerSubmissionTimerDisplay }}
						</span>
					</Button>
					<Button
						v-if="parsedEmailData && parsedEmailData.operationType === 2"
						:loading="isUpdateRecipientLoading"
						:disabled="isUpdateRecipientLoading || isParsingEmail || isButtonDisabled"
						@click="onClickUpdateRecipient(parsedEmailData.title, parsedEmailData.recipient)"
					>
						Update Recipient
						<span
							v-if="isUpdateRecipientLoading"
							:class="{ 'text-red-500': updateRecipientCountdown <= 0 }"
						>
							&nbsp;{{ updateRecipientTimerDisplay }}
						</span>
					</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Submissions Section -->
		<div class="space-y-4">
			<div v-if="royaltyAutoClaimStore.isLoading || isPollingForSubmissionUpdate" class="flex justify-center">
				<Loader2 :size="20" class="animate-spin" />
			</div>

			<div
				v-else-if="!royaltyAutoClaimStore.submissions.length && !royaltyAutoClaimStore.isLoading"
				class="text-gray-500 text-center"
			>
				No Submissions
			</div>

			<Card v-else v-for="submission in reversedSubmissions" :key="submission.title">
				<CardHeader class="pb-3">
					<div class="flex items-center justify-between">
						<CardTitle>{{ submission.title }}</CardTitle>
					</div>
				</CardHeader>

				<CardContent>
					<div class="space-y-1 text-sm text-muted-foreground flex justify-between">
						<div>
							<div class="flex">
								<div>Recipient:&nbsp;</div>
								<Address :address="submission.recipient" />
							</div>
							<p>Reviews: {{ submission.reviewCount }}</p>
							<p>Average Royalty: {{ getAvgRoyaltyLevel(submission) || 0 }} USD</p>
							<p v-if="submission.status === 'claimed'">Status: {{ submission.status }}</p>
						</div>
					</div>

					<div v-if="submission.status === 'registered'" class="flex flex-wrap items-center gap-4 pt-4">
						<div class="w-[200px]">
							<Select v-model="selectedRoyaltyLevel" :disabled="isButtonDisabled">
								<SelectTrigger>
									<SelectValue placeholder="Select royalty level" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem v-for="level in ROYALTY_LEVELS" :key="level.value" :value="level.value">
										{{ level.label }}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<Button
							@click="() => onClickSubmitReview(submission.title)"
							:loading="isSubmittingReview(submission.title)"
							:disabled="isButtonDisabled"
						>
							Submit Review
						</Button>
						<Button
							v-if="submission.reviewCount && submission.reviewCount >= 2"
							variant="secondary"
							@click="() => onClickClaimRoyalty(submission.title)"
							:loading="isClaimingRoyalty(submission.title)"
							:disabled="isButtonDisabled"
						>
							Claim Royalty
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	</div>
</template>

<style lang="css"></style>
