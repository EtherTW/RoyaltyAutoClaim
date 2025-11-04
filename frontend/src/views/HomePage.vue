<script setup lang="ts">
import { useContractCall } from '@/lib/useContractCall'
import { parseEmailData } from '@/lib/zkemail-utils'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { Submission, useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { Plus, Settings } from 'lucide-vue-next'

const isButtonDisabled = computed(() => isSubmitReviewLoading.value || isClaimRoyaltyLoading.value)

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
const blockchainStore = useBlockchainStore()

onMounted(async () => {
	if (!blockchainStore.royaltyAutoClaimProxyAddress) {
		throw new Error('RoyaltyAutoClaim address not set')
	}

	await royaltyAutoClaimStore.fetchSubmissions()
})

// ===================================== email upload =====================================

const fileInputRef = ref<HTMLInputElement | null>(null)
const showUploadCard = ref(false)
const uploadedFile = ref<File | null>(null)
const fileContent = ref('')
const parsedEmailData = ref<Awaited<ReturnType<typeof parseEmailData>> | null>(null)
const parseError = ref<string | null>(null)
const isParsingEmail = ref(false)

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
		try {
			parsedEmailData.value = await parseEmailData(text)
		} catch (error) {
			parseError.value = error instanceof Error ? error.message : 'Failed to parse email'
			console.error('Error parsing email:', error)
		} finally {
			isParsingEmail.value = false
		}
	}
	reader.readAsText(file)
}

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
const { isLoading: isSubmitReviewLoading, send: onClickSubmitReview } = useContractCall({
	getCalldata: (submissionTitle: string) =>
		royaltyAutoClaimStore.royaltyAutoClaim.interface.encodeFunctionData('reviewSubmission', [
			submissionTitle,
			selectedRoyaltyLevel.value,
		]),
	successTitle: 'Successfully Submitted Review',
	waitingTitle: 'Waiting for Review Submission',
	errorTitle: 'Error Submitting Review',
	onBeforeCall: async (submissionTitle: string) => {
		submissionBeingOperated.value = submissionTitle
	},
	onAfterCall: async (submissionTitle: string) => {
		const submissionData = await royaltyAutoClaimStore.royaltyAutoClaim.submissions(submissionTitle)
		const found = royaltyAutoClaimStore.submissions.find(submission => submission.title === submissionTitle)
		if (!found) {
			throw new Error('reviewSubmission onAfterCall: Submission not found')
		}
		found.reviewCount = Number(submissionData.reviewCount)
		found.totalRoyaltyLevel = Number(submissionData.totalRoyaltyLevel)
	},
})

// Claim Royalty
const { isLoading: isClaimRoyaltyLoading, send: onClickClaimRoyalty } = useContractCall({
	getCalldata: (submissionTitle: string) =>
		royaltyAutoClaimStore.royaltyAutoClaim.interface.encodeFunctionData('claimRoyalty', [submissionTitle]),
	successTitle: 'Successfully Claimed Royalty',
	waitingTitle: 'Waiting for Royalty Claim',
	errorTitle: 'Error Claiming Royalty',
	onBeforeCall: async (submissionTitle: string) => {
		submissionBeingOperated.value = submissionTitle
	},
	onAfterCall: async (submissionTitle: string) => {
		const submissionData = await royaltyAutoClaimStore.royaltyAutoClaim.submissions(submissionTitle)
		const found = royaltyAutoClaimStore.submissions.find(submission => submission.title === submissionTitle)
		if (!found) {
			throw new Error('claimRoyalty onAfterCall: Submission not found')
		}
		found.status = Number(submissionData.status) === 1 ? 'registered' : 'claimed'
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
			<Button @click="toggleUploadCard" size="sm" variant="ghost">
				<Plus :size="16" />
				<div>Register or Update Recipient</div>
			</Button>

			<RouterLink :to="{ name: 'v2-config' }">
				<Button size="icon" variant="ghost">
					<Settings />
				</Button>
			</RouterLink>
		</div>

		<!-- Email Upload Section -->
		<Card v-if="showUploadCard" class="mb-6">
			<CardContent class="pt-6">
				<div class="flex flex-col gap-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3 flex-1">
							<input
								ref="fileInputRef"
								type="file"
								@change="handleFileUpload"
								accept=".eml"
								class="hidden"
							/>
							<Button @click="() => fileInputRef?.click()" variant="default" size="sm">
								Upload Email (.eml)
							</Button>
							<span v-if="uploadedFile" class="text-sm text-muted-foreground truncate">
								{{ uploadedFile.name }}
							</span>
						</div>
						<Button @click="toggleUploadCard" size="sm" variant="secondary"> Close </Button>
					</div>

					<div
						v-if="isParsingEmail"
						class="text-xs text-muted-foreground bg-muted px-3 py-2 rounded flex items-center gap-2"
					>
						<div
							class="animate-spin h-3 w-3 border-2 border-muted-foreground border-t-transparent rounded-full"
						></div>
						Parsing email...
					</div>
					<div v-if="parseError" class="text-xs text-red-500 bg-red-50 dark:bg-red-950 px-3 py-2 rounded">
						Error: {{ parseError }}
					</div>
					<div v-if="parsedEmailData" class="space-y-2 text-xs bg-muted px-3 py-3 rounded">
						<div class="grid gap-1.5">
							<!-- <div>
								<span class="text-muted-foreground">Email Sender: </span>
								<span class="text-foreground">{{ parsedEmailData.emailSender }}</span>
							</div> -->
							<div>
								<span class="text-muted-foreground">Title: </span>
								<span class="text-foreground">{{ parsedEmailData.title }}</span>
							</div>
							<!-- <div>
								<span class="text-muted-foreground">ID: </span>
								<span class="text-foreground">{{ parsedEmailData.id }}</span>
							</div> -->
							<div>
								<span class="text-muted-foreground">Recipient: </span>
								<span class="text-foreground font-mono">{{ parsedEmailData.recipient }}</span>
							</div>
							<!-- <div>
								<span class="text-muted-foreground">Type: </span>
								<span class="text-foreground">{{ parsedEmailData.subjectType }}</span>
							</div> -->
						</div>
					</div>
					<Button v-if="parsedEmailData">
						{{
							parsedEmailData.subjectType === 'registration' ? 'Register Submission' : 'Update Recipient'
						}}
					</Button>
				</div>
			</CardContent>
		</Card>

		<!-- Submissions Section -->
		<div class="space-y-4">
			<div
				v-if="!royaltyAutoClaimStore.submissions.length && !royaltyAutoClaimStore.isLoading"
				class="text-gray-500 text-center"
			>
				No Submissions
			</div>

			<Card v-for="submission in reversedSubmissions" :key="submission.title">
				<CardHeader>
					<div class="flex items-center justify-between">
						<CardTitle>{{ submission.title }}</CardTitle>
					</div>
				</CardHeader>

				<CardContent>
					<div class="space-y-1 text-sm text-muted-foreground flex justify-between">
						<div>
							<div>Recipient: <Address :address="submission.recipient" /></div>
							<p>Reviews: {{ submission.reviewCount }}</p>
							<p>Avg Royalty: {{ getAvgRoyaltyLevel(submission) || 0 }} USD</p>
							<p v-if="submission.status === 'claimed'">Status: {{ submission.status }}</p>
						</div>
					</div>

					<div v-if="submission.status === 'registered'" class="flex flex-wrap items-center gap-4 pt-4">
						<div class="w-[200px]">
							<Select v-model="selectedRoyaltyLevel">
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
