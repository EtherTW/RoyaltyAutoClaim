<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ERROR_NOTIFICATION_DURATION } from '@/config'
import { fetchExistingSubmissions } from '@/lib/RoyaltyAutoClaim'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { notify } from '@kyvg/vue3-notification'
import { Loader2 } from 'lucide-vue-next'

const selectedRoyaltyLevel = ref('')
const royaltyLevels = [
	{ value: '20', label: '20' },
	{ value: '40', label: '40' },
	{ value: '60', label: '60' },
	{ value: '80', label: '80' },
]

const handleReviewSubmit = () => {}

const handleClaimRoyalty = () => {}

type Submission = {
	title: string
	recipient: string
	reviewCount: number | null
	totalRoyaltyLevel: number | null
	status: 'registered' | 'claimed' | null
}

const submissions = ref<Submission[]>([])
const isLoadingBasicSubmissions = ref(false)
const isLoadingSubmissionData = ref(false)

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

onMounted(async () => {
	try {
		isLoadingBasicSubmissions.value = true

		const basicSubmissions = await fetchExistingSubmissions(royaltyAutoClaimStore.royaltyAutoClaim)

		submissions.value = basicSubmissions.map(submission => ({
			title: submission.title,
			recipient: submission.recipient,
			reviewCount: null,
			totalRoyaltyLevel: null,
			status: null,
		}))

		isLoadingBasicSubmissions.value = false

		isLoadingSubmissionData.value = true
		await Promise.all(
			submissions.value.map(async submission => {
				const submissionData = await royaltyAutoClaimStore.royaltyAutoClaim.submissions(submission.title)
				submission.reviewCount = Number(submissionData.reviewCount)
				submission.totalRoyaltyLevel = Number(submissionData.totalRoyaltyLevel)
				submission.status = Number(submissionData.status) === 1 ? 'registered' : 'claimed'
			}),
		)
		isLoadingSubmissionData.value = false
	} catch (err: any) {
		notify({
			title: 'Error fetching submissions',
			text: err.message,
			type: 'error',
			duration: ERROR_NOTIFICATION_DURATION,
		})
	} finally {
		isLoadingBasicSubmissions.value = false
		isLoadingSubmissionData.value = false
	}
})
</script>

<template>
	<div class="container mx-auto p-8">
		<div class="space-y-4">
			<div
				v-if="isLoadingBasicSubmissions || isLoadingSubmissionData"
				class="flex items-center justify-center mb-6"
			>
				<Loader2 class="w-4 h-4 ml-2 animate-spin" />
			</div>

			<div v-else-if="!submissions.length" class="text-gray-500 text-center">No Submissions</div>

			<Card v-for="submission in [...submissions].reverse()" :key="submission.title">
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
							<p>Avg Royalty Level: {{ submission.totalRoyaltyLevel }} USD</p>
						</div>
					</div>

					<div v-if="submission.status === 'registered'" class="flex flex-wrap items-center gap-4 pt-4">
						<div class="w-[200px]">
							<Select v-model="selectedRoyaltyLevel">
								<SelectTrigger>
									<SelectValue placeholder="Select royalty level" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem v-for="level in royaltyLevels" :key="level.value" :value="level.value">
										{{ level.label }}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<Button variant="secondary" @click="handleReviewSubmit">Submit Review</Button>
						<Button
							v-if="submission.reviewCount && submission.reviewCount >= 2"
							@click="handleClaimRoyalty"
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
