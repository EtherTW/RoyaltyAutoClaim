<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useContractCall } from '@/lib/useContractCall'
import { RAC_V1_INTERFACE } from '@/lib/v1-interface'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { Submission, useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { Loader2, Settings } from 'lucide-vue-next'

const isButtonDisabled = computed(() => isSubmitReviewLoading.value || isClaimRoyaltyLoading.value)

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()
const blockchainStore = useBlockchainStore()

onMounted(async () => {
	if (!blockchainStore.royaltyAutoClaimProxyAddress) {
		throw new Error('RoyaltyAutoClaim address not set')
	}
	await royaltyAutoClaimStore.fetchSubmissions()
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
const { isLoading: isSubmitReviewLoading, send: onClickSubmitReview } = useContractCall({
	getCalldata: (submissionTitle: string) =>
		RAC_V1_INTERFACE.encodeFunctionData('reviewSubmission', [submissionTitle, selectedRoyaltyLevel.value]),
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
	getCalldata: (submissionTitle: string) => RAC_V1_INTERFACE.encodeFunctionData('claimRoyalty', [submissionTitle]),
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
		<div class="flex justify-end mb-2">
			<RouterLink :to="{ name: 'v1-config' }">
				<Button size="icon" variant="ghost">
					<Settings />
				</Button>
			</RouterLink>
		</div>

		<div class="space-y-4">
			<div v-if="royaltyAutoClaimStore.isLoading" class="flex justify-center">
				<Loader2 :size="20" class="animate-spin" />
			</div>

			<div
				v-else-if="!royaltyAutoClaimStore.submissions.length && !royaltyAutoClaimStore.isLoading"
				class="text-gray-500 text-center"
			>
				No Submissions
			</div>

			<Card v-else v-for="submission in reversedSubmissions" :key="submission.title">
				<CardHeader>
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
