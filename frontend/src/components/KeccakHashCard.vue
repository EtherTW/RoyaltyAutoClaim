<script setup lang="ts">
import { keccak256, toUtf8Bytes } from 'ethers'
import { Check, Copy } from 'lucide-vue-next'

const input = ref('')

const hashOutput = computed(() => {
	if (!input.value) return ''
	return keccak256(toUtf8Bytes(input.value))
})

const isCopied = ref(false)

function copyToClipboard() {
	if (!hashOutput.value) return
	navigator.clipboard.writeText(hashOutput.value)
	isCopied.value = true
	setTimeout(() => {
		isCopied.value = false
	}, 2000)
}
</script>

<template>
	<Card>
		<CardHeader>
			<CardTitle>Keccak256 Hash</CardTitle>
		</CardHeader>
		<CardContent>
			<div class="grid w-full items-center gap-4">
				<div class="flex flex-col space-y-1.5">
					<Label for="hashInput">Input</Label>
					<Input id="hashInput" v-model="input" placeholder="Enter text to hash" />
				</div>

				<div v-if="hashOutput" class="space-y-2 text-xs bg-muted px-3 py-3 rounded">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 flex-1">
							<span class="text-foreground font-mono break-all">{{ hashOutput }}</span>
						</div>
						<Button size="icon" variant="ghost" class="h-6 w-6 shrink-0" @click="copyToClipboard">
							<Check v-if="isCopied" class="h-3 w-3" />
							<Copy v-else class="h-3 w-3" />
						</Button>
					</div>
				</div>
			</div>
		</CardContent>
	</Card>
</template>
