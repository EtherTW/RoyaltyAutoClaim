<script setup lang="ts">
import { keccak256, toUtf8Bytes } from 'ethers'
import { AlertCircle, Check, Copy } from 'lucide-vue-next'

type OperationType = 'registration' | 'update-recipient'

const title = ref('')
const num = ref('')
const recipient = ref('')
const memo = ref('')
const operationType = ref<OperationType>('registration')

const operationTypeOptions: { value: OperationType; label: string }[] = [
	{ value: 'registration', label: '確認已收到投稿' },
	{ value: 'update-recipient', label: '確認此投稿更改稿費收取地址' },
]

const titleId = computed(() => {
	if (!title.value) return ''
	return keccak256(toUtf8Bytes(title.value))
})

// Validation
const titleError = computed(() => {
	if (!title.value) return ''
	if (!title.value.includes(' by ')) return 'Title must contain " by "'
	return ''
})

const numError = computed(() => {
	if (!num.value) return ''
	const n = Number.parseInt(num.value, 10)
	if (Number.isNaN(n) || n < 1 || n > 999) return 'Number must be between 1 and 999'
	return ''
})

const recipientError = computed(() => {
	if (!recipient.value) return ''
	if (!/^0x[a-fA-F0-9]{40}$/.test(recipient.value)) return 'Invalid Ethereum address'
	return ''
})

const memoError = computed(() => {
	if (!memo.value.trim()) return ''
	// Check for Chinese characters (CJK Unified Ideographs range)
	if (/[\u4e00-\u9fff]/.test(memo.value)) return 'Memo must be in English (no Chinese characters)'
	return ''
})

const hasValidationErrors = computed(() => {
	return !!(titleError.value || numError.value || recipientError.value || memoError.value)
})

const emailSubject = computed(() => {
	if (!title.value) return ''
	if (operationType.value === 'registration') {
		return `確認已收到投稿: ${title.value}`
	}
	return `確認此投稿更改稿費收取地址: ${title.value}`
})

const emailBody = computed(() => {
	if (!title.value || !num.value || !recipient.value) return ''

	const lines = [`No: ${num.value}`, `ID: ${titleId.value}`, `Recipient: ${recipient.value}`]

	if (memo.value.trim()) {
		lines.push(`Memo: ${memo.value}`)
	}

	return lines.join('\n')
})

const isSubjectCopied = ref(false)
const isBodyCopied = ref(false)

function copyToClipboard(text: string, type: 'subject' | 'body') {
	navigator.clipboard.writeText(text)
	if (type === 'subject') {
		isSubjectCopied.value = true
		setTimeout(() => {
			isSubjectCopied.value = false
		}, 2000)
	} else {
		isBodyCopied.value = true
		setTimeout(() => {
			isBodyCopied.value = false
		}, 2000)
	}
}
</script>

<template>
	<Card>
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle>Email Generator</CardTitle>
			</div>
		</CardHeader>
		<CardContent>
			<div class="grid w-full items-center gap-4">
				<div class="flex flex-col space-y-1.5">
					<Label>Operation Type</Label>
					<Select v-model="operationType">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem
									v-for="option in operationTypeOptions"
									:key="option.value"
									:value="option.value"
								>
									{{ option.label }}
								</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>

				<div class="flex flex-col space-y-1.5">
					<Label for="title">Title</Label>
					<Input id="title" v-model="title" placeholder="Submission title" />
					<p v-if="titleError" class="text-sm text-destructive">{{ titleError }}</p>
				</div>

				<div class="flex flex-col space-y-1.5">
					<Label for="num">Number</Label>
					<Input id="num" v-model="num" type="number" placeholder="Email number" />
					<p v-if="numError" class="text-sm text-destructive">{{ numError }}</p>
				</div>

				<div class="flex flex-col space-y-1.5">
					<Label for="recipient">Recipient</Label>
					<Input id="recipient" v-model="recipient" placeholder="0x..." />
					<p v-if="recipientError" class="text-sm text-destructive">{{ recipientError }}</p>
				</div>

				<div class="flex flex-col space-y-1.5">
					<Label for="memo">Memo (optional)</Label>
					<Input id="memo" v-model="memo" placeholder="Additional notes" />
					<p v-if="memoError" class="text-sm text-destructive">{{ memoError }}</p>
				</div>

				<!-- Subject Section -->
				<div v-if="emailSubject && !hasValidationErrors" class="space-y-2 text-xs bg-muted px-3 py-3 rounded">
					<div class="flex items-center justify-between gap-2">
						<div>
							<span class="text-foreground">{{ emailSubject }}</span>
						</div>
						<Button
							size="icon"
							variant="ghost"
							class="h-6 w-6 shrink-0"
							@click="copyToClipboard(emailSubject, 'subject')"
						>
							<Check v-if="isSubjectCopied" class="h-3 w-3" />
							<Copy v-else class="h-3 w-3" />
						</Button>
					</div>
				</div>

				<!-- Body Section -->
				<div v-if="emailBody && !hasValidationErrors" class="space-y-2 text-xs bg-muted px-3 py-3 rounded">
					<div class="flex items-start justify-between gap-2">
						<div class="grid gap-1.5">
							<div v-for="line in emailBody.split('\n')" :key="line">
								<span class="text-muted-foreground">{{ line.split(': ')[0] }}: </span>
								<span class="text-foreground font-mono break-all">{{
									line.split(': ').slice(1).join(': ')
								}}</span>
							</div>
						</div>
						<Button
							size="icon"
							variant="ghost"
							class="h-6 w-6 shrink-0"
							@click="copyToClipboard(emailBody, 'body')"
						>
							<Check v-if="isBodyCopied" class="h-3 w-3" />
							<Copy v-else class="h-3 w-3" />
						</Button>
					</div>
				</div>

				<!-- Notice -->
				<div
					v-if="emailSubject && emailBody && !hasValidationErrors"
					class="flex gap-1.5 items-start justify-start text-sm p-3 bg-yellow-500/20 rounded-lg break-words"
				>
					<span class="mt-0.5"><AlertCircle class="w-4 h-4" /></span>
					<span>Remember to enable "plain text mode" when composing the email.</span>
				</div>
			</div>
		</CardContent>
	</Card>
</template>
