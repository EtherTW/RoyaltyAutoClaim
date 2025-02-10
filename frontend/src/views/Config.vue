<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

const loading = computed(() => royaltyAutoClaimStore.isLoading)
const disabled = computed(() => royaltyAutoClaimStore.isBtnDisabled)

function onClickRegisterSubmission() {
	royaltyAutoClaimStore.registerSubmission('test', '0x1234567890123456789012345678901234567890')
}
</script>

<template>
	<div class="container mx-auto p-8">
		<Card class="mb-8">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Submission Management</CardTitle>
					<Badge variant="secondary">onlyAdmin</Badge>
				</div>
				<CardDescription>Register, update, or revoke submissions</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<Label for="submissionTitle">Submission Title</Label>
						<Input id="submissionTitle" placeholder="Enter submission title" />
					</div>
					<div class="flex flex-col space-y-1.5">
						<Label for="royaltyRecipient">Royalty Recipient Address</Label>
						<Input id="royaltyRecipient" placeholder="0x..." />
					</div>
					<div class="flex gap-4 flex-wrap">
						<Button
							variant="default"
							:loading="loading"
							:disabled="disabled"
							@click="onClickRegisterSubmission"
						>
							Register Submission
						</Button>
						<Button variant="default" :loading="loading" :disabled="disabled">Update Recipient</Button>
						<Button variant="destructive" :loading="loading" :disabled="disabled">Revoke Submission</Button>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="mb-8">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Reviewer Management</CardTitle>
					<Badge variant="secondary">onlyAdmin</Badge>
				</div>
				<CardDescription>Add or remove reviewers</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<Label for="reviewer">Reviewer Address</Label>
						<Input id="reviewer" placeholder="0x..." />
					</div>
					<div class="flex gap-4">
						<Button variant="default">Add Reviewer</Button>
						<Button variant="destructive">Remove Reviewer</Button>
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="mb-8">
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Admin Management</CardTitle>
					<Badge variant="secondary">onlyOwner</Badge>
				</div>
				<CardDescription>Change admin address and royalty token</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<Label for="admin">New Admin Address</Label>
						<Input id="admin" placeholder="0x..." />
					</div>
					<Button>Change Admin</Button>

					<div class="flex flex-col space-y-1.5">
						<Label for="token">New Royalty Token Address</Label>
						<Input id="token" placeholder="0x..." />
					</div>
					<Button>Change Token</Button>
				</div>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Emergency Withdraw</CardTitle>
					<Badge variant="secondary">onlyOwner</Badge>
				</div>
				<CardDescription>Withdraw tokens in case of emergency</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-4">
					<div class="flex flex-col space-y-1.5">
						<Label for="withdrawToken">Token Address</Label>
						<Input id="withdrawToken" placeholder="0x..." />
					</div>
					<div class="flex flex-col space-y-1.5">
						<Label for="amount">Amount</Label>
						<Input id="amount" type="number" placeholder="0.0" />
					</div>
					<Button variant="destructive">Emergency Withdraw</Button>
				</div>
			</CardContent>
		</Card>
	</div>
</template>

<style scoped>
.container {
	max-width: 768px;
}
</style>
