<script setup lang="ts">
import { SEMAPHORE_IDENTITY_MESSAGE } from '@/config'
import { useEOAStore } from '@/stores/useEOA'
import { Identity } from '@semaphore-protocol/identity'
import { useVueDapp } from '@vue-dapp/core'
import { Copy, Check } from 'lucide-vue-next'

const eoaStore = useEOAStore()

const walletAddress = computed(() => eoaStore.signer?.address || null)
const identityCommitment = ref<string | null>(null)
const isSigning = ref(false)
const isCopied = ref(false)

const { watchAddressChanged } = useVueDapp()

watchAddressChanged(() => {
	identityCommitment.value = null
})

async function signAndGenerateIdentity() {
	if (!eoaStore.signer) {
		return
	}

	try {
		isSigning.value = true
		const signature = await eoaStore.signer.signMessage(SEMAPHORE_IDENTITY_MESSAGE)
		const identity = new Identity(signature)
		identityCommitment.value = identity.commitment.toString()
	} catch (error) {
		console.error('Error signing message:', error)
	} finally {
		isSigning.value = false
	}
}

async function copyToClipboard() {
	if (!identityCommitment.value) return

	try {
		await navigator.clipboard.writeText(identityCommitment.value)
		isCopied.value = true
		setTimeout(() => {
			isCopied.value = false
		}, 2000)
	} catch (error) {
		console.error('Failed to copy:', error)
	}
}
</script>

<template>
	<div class="container mx-auto p-8 max-w-2xl">
		<Card>
			<CardHeader>
				<CardTitle>Generate Reviewer Identity</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="grid w-full items-center gap-6">
					<!-- Wallet Connection Status -->
					<div class="flex flex-col space-y-2">
						<Label>Wallet Address</Label>
						<div v-if="walletAddress" class="flex items-center gap-2">
							<code class="text-sm bg-muted px-3 py-2 rounded-md flex-1 font-mono">
								{{ walletAddress }}
							</code>
						</div>
						<div v-else class="text-muted-foreground text-sm">
							Please connect your wallet using the button in the header
						</div>
					</div>

					<!-- Sign Button -->
					<Button
						:disabled="!walletAddress || isSigning"
						:loading="isSigning"
						@click="signAndGenerateIdentity"
						class="w-full"
					>
						{{ isSigning ? 'Signing...' : 'Sign Message' }}
					</Button>

					<!-- Identity Commitment Result -->
					<div v-if="identityCommitment" class="flex flex-col space-y-2">
						<Label>Identity Commitment</Label>
						<div class="flex items-center gap-2">
							<code class="text-sm bg-muted px-3 py-2 rounded-md flex-1 font-mono break-all">
								{{ identityCommitment }}
							</code>
							<Button size="icon" variant="outline" @click="copyToClipboard" class="shrink-0">
								<Check v-if="isCopied" class="h-4 w-4" />
								<Copy v-else class="h-4 w-4" />
							</Button>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>
</template>
