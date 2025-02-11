<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchExistingSubmissions } from '@/lib/RoyaltyAutoClaim'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { notify } from '@kyvg/vue3-notification'

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

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

onMounted(async () => {
	try {
		const basicSubmissions = await fetchExistingSubmissions(royaltyAutoClaimStore.royaltyAutoClaim)

		submissions.value = basicSubmissions.map(submission => ({
			title: submission.title,
			recipient: submission.recipient,
			reviewCount: null,
			totalRoyaltyLevel: null,
			status: null,
		}))

		submissions.value.forEach(async submission => {
			const submissionData = await royaltyAutoClaimStore.royaltyAutoClaim.submissions(submission.title)
			submission.reviewCount = Number(submissionData.reviewCount)
			submission.totalRoyaltyLevel = Number(submissionData.totalRoyaltyLevel)
			submission.status = Number(submissionData.status) === 1 ? 'registered' : 'claimed'
		})
	} catch (err: any) {
		notify({
			title: 'Error fetching submissions',
			text: err.message,
			type: 'error',
		})
	}
})
</script>

<template>
	<div class="container mx-auto p-8">
		<h1 class="text-2xl font-bold text-center mb-6">Submissions</h1>

		<div class="space-y-4">
			<Card v-for="submission in submissions" :key="submission.title">
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
