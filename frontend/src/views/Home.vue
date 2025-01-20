<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ref } from 'vue'

const title = ref('')
const selectedRoyaltyLevel = ref('')
const royaltyLevels = [
	{ value: '20', label: '20' },
	{ value: '40', label: '40' },
	{ value: '60', label: '60' },
	{ value: '80', label: '80' },
]

const handleReviewSubmit = () => {
	// TODO: Implement review submission
	console.log('Review submitted:', { title: title.value, royaltyLevel: selectedRoyaltyLevel.value })
}

const handleClaimRoyalty = () => {
	// TODO: Implement royalty claim
	console.log('Claiming royalty for:', title.value)
}

// Add new data for submissions
const submissions = ref([
	{
		title: 'Title A',
		recipient: '0x1234...5678',
		reviewCount: 1,
		totalRoyaltyLevel: 20,
		status: 'registered',
	},
	{
		title: 'Title B',
		recipient: '0x1234...5678',
		reviewCount: 2,
		totalRoyaltyLevel: 60,
		status: 'registered',
	},
	{
		title: 'Title C',
		recipient: '0x8765...4321',
		reviewCount: 3,
		totalRoyaltyLevel: 80,
		status: 'claimed',
	},
])

const getStatusColor = (status: string) => {
	return status === 'claimed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
}
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
							<p>Recipient: {{ submission.recipient }}</p>
							<p>Reviews: {{ submission.reviewCount }}</p>
							<p>Total Royalty Level: {{ submission.totalRoyaltyLevel }}%</p>
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
						<Button v-if="submission.reviewCount >= 2" @click="handleClaimRoyalty"> Claim Royalty </Button>
					</div>
				</CardContent>
			</Card>
		</div>
	</div>
</template>

<style lang="css"></style>
