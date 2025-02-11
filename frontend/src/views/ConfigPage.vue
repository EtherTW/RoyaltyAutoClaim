<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useContractCall } from '@/lib/useContractCall'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'

const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

const isBtnDisabled = computed(
	() =>
		!royaltyAutoClaimStore.royaltyAutoClaim4337 ||
		isRegisterLoading.value ||
		isUpdateLoading.value ||
		isRevokeLoading.value,
)

const title = ref('test')
const recipient = ref('0x1234567890123456789012345678901234567890')

const { isLoading: isRegisterLoading, send: onClickRegisterSubmission } = useContractCall({
	calldata: computed(() =>
		royaltyAutoClaimStore.royaltyAutoClaim.interface.encodeFunctionData('registerSubmission', [
			title.value,
			recipient.value,
		]),
	),
	successTitle: 'Successfully Registered Submission',
	waitingTitle: 'Waiting for Register Submission',
	errorTitle: 'Error Registering Submission',
})

const { isLoading: isUpdateLoading, send: onClickUpdateRecipient } = useContractCall({
	calldata: computed(() =>
		royaltyAutoClaimStore.royaltyAutoClaim.interface.encodeFunctionData('updateRoyaltyRecipient', [
			title.value,
			recipient.value,
		]),
	),
	successTitle: 'Successfully Updated Recipient',
	waitingTitle: 'Waiting for Update Recipient',
	errorTitle: 'Error Updating Recipient',
})

const { isLoading: isRevokeLoading, send: onClickRevokeSubmission } = useContractCall({
	calldata: computed(() =>
		royaltyAutoClaimStore.royaltyAutoClaim.interface.encodeFunctionData('revokeSubmission', [title.value]),
	),
	successTitle: 'Successfully Revoked Submission',
	waitingTitle: 'Waiting for Revoke Submission',
	errorTitle: 'Error Revoking Submission',
})
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
						<Input id="submissionTitle" v-model="title" placeholder="Enter submission title" />
					</div>
					<div class="flex flex-col space-y-1.5">
						<Label for="royaltyRecipient">Royalty Recipient Address</Label>
						<Input id="royaltyRecipient" v-model="recipient" placeholder="0x..." />
					</div>
					<div class="flex gap-4 flex-wrap">
						<Button
							variant="default"
							:loading="isRegisterLoading"
							:disabled="isBtnDisabled"
							@click="onClickRegisterSubmission"
						>
							Register Submission
						</Button>
						<Button
							variant="default"
							:loading="isUpdateLoading"
							:disabled="isBtnDisabled"
							@click="onClickUpdateRecipient"
						>
							Update Recipient
						</Button>
						<Button
							variant="destructive"
							:loading="isRevokeLoading"
							:disabled="isBtnDisabled"
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
