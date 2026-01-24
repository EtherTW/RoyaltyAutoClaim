<script setup lang="ts">
import { formatErrMsg, normalizeError } from '@/lib/error'
import { useContractCallV2 } from '@/lib/useContractCallV2'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { useRoyaltyAutoClaimStore } from '@/stores/useRoyaltyAutoClaim'
import { RoyaltyAutoClaim__factory } from '@/typechain-v2'
import { shortenAddress } from '@vue-dapp/core'
import { Contract, formatEther, isAddress, parseEther } from 'ethers'
import { Check, Copy } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{
	royaltyAutoClaimToken: string
	disabled?: boolean
}>()

const iface = RoyaltyAutoClaim__factory.createInterface()
const blockchainStore = useBlockchainStore()
const royaltyAutoClaimStore = useRoyaltyAutoClaimStore()

const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
const CUSTOM_TOKEN = 'custom'
const withdrawTokenSelection = ref(NATIVE_TOKEN)
const customWithdrawToken = ref('')

const withdrawToken = computed(() => {
	if (withdrawTokenSelection.value === CUSTOM_TOKEN) {
		return customWithdrawToken.value
	}
	return withdrawTokenSelection.value
})
const withdrawAmount = ref<string>('0')

// Emergency Withdraw
const { isLoading: isEmergencyWithdrawLoading, send: onClickEmergencyWithdraw } = useContractCallV2({
	getCalldata: () =>
		iface.encodeFunctionData('emergencyWithdraw', [withdrawToken.value, withdrawAmount.value.toString()]),
	successTitle: 'Successfully Withdrew Tokens',
	errorTitle: 'Error Withdrawing Tokens',
	onBeforeCall: async () => {
		if (parseEther(withdrawAmount.value.toString()) <= 0) {
			throw new Error('Amount must be greater than 0')
		}
	},
})

const isMaxBtnDisabled = ref(false)

const onClickMax = useThrottleFn(async () => {
	const client = blockchainStore.client

	if (!withdrawToken.value) {
		withdrawAmount.value = '0'
		return
	}

	try {
		isMaxBtnDisabled.value = true
		if (withdrawToken.value === NATIVE_TOKEN) {
			const balance = await client.getBalance(royaltyAutoClaimStore.royaltyAutoClaim.getAddress())
			withdrawAmount.value = balance.toString()
		} else {
			const erc20 = new Contract(
				withdrawToken.value,
				['function balanceOf(address) view returns (uint256)'],
				client,
			)
			const balance: bigint = await erc20.balanceOf(royaltyAutoClaimStore.royaltyAutoClaim.getAddress())
			withdrawAmount.value = balance.toString()
		}
	} catch (e: unknown) {
		withdrawAmount.value = '0'
		const err = normalizeError(e)
		console.error(err)
		toast.error('Error Fetching Balance', {
			description: formatErrMsg(err),
			duration: Infinity,
		})
	} finally {
		isMaxBtnDisabled.value = false
	}
}, 1000)

const displayTokenAmount = computed(() => {
	try {
		return formatEther(BigInt(withdrawAmount.value))
	} catch {
		return '0'
	}
})

const isWithdrawAmountValid = computed(() => {
	try {
		return BigInt(withdrawAmount.value || '0') > 0n
	} catch {
		return false
	}
})

const withdrawTokenOptions = computed(() => {
	const options: { value: string; label: string; showAddress: boolean }[] = [
		{ value: NATIVE_TOKEN, label: 'Native Token (ETH)', showAddress: true },
	]
	if (props.royaltyAutoClaimToken) {
		options.push({ value: props.royaltyAutoClaimToken, label: 'RoyaltyAutoClaim Token', showAddress: true })
	}
	options.push({ value: CUSTOM_TOKEN, label: 'Custom', showAddress: false })
	return options
})

const isCustomTokenSelected = computed(() => withdrawTokenSelection.value === CUSTOM_TOKEN)

const selectedWithdrawTokenLabel = computed(() => {
	const option = withdrawTokenOptions.value.find(o => o.value === withdrawTokenSelection.value)
	return option?.label ?? ''
})

const truncatedWithdrawToken = computed(() => {
	if (isCustomTokenSelected.value) {
		if (!customWithdrawToken.value) return ''
		return shortenAddress(customWithdrawToken.value)
	}
	return shortenAddress(withdrawTokenSelection.value)
})

const isWithdrawTokenCopied = ref(false)

async function copyWithdrawToken() {
	try {
		await navigator.clipboard.writeText(withdrawToken.value)
		isWithdrawTokenCopied.value = true
		setTimeout(() => {
			isWithdrawTokenCopied.value = false
		}, 2000)
	} catch (error) {
		console.error('Failed to copy:', error)
	}
}

const isBtnDisabled = computed(() => props.disabled || isEmergencyWithdrawLoading.value || isMaxBtnDisabled.value)
</script>

<template>
	<Card>
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle>Emergency Withdraw</CardTitle>
			</div>
			<CardDescription>onlyOwner</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="grid w-full items-center gap-4">
				<div class="flex flex-col space-y-1.5">
					<Label for="withdrawToken">Token</Label>
					<div class="flex gap-2">
						<Select v-model="withdrawTokenSelection" class="flex-1">
							<SelectTrigger>
								<span>
									{{ selectedWithdrawTokenLabel }}
									<span v-if="truncatedWithdrawToken" class="text-xs text-muted-foreground ml-1">{{
										truncatedWithdrawToken
									}}</span>
								</span>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem
										v-for="option in withdrawTokenOptions"
										:key="option.value"
										:value="option.value"
									>
										<span>{{ option.label }}</span>
										<span v-if="option.showAddress" class="text-xs text-muted-foreground ml-1">{{
											shortenAddress(option.value)
										}}</span>
									</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
						<Button size="icon" variant="outline" class="shrink-0 h-10 w-10" @click="copyWithdrawToken">
							<Check v-if="isWithdrawTokenCopied" class="h-4 w-4" />
							<Copy v-else class="h-4 w-4" />
						</Button>
					</div>
					<Input
						v-if="isCustomTokenSelected"
						v-model="customWithdrawToken"
						placeholder="Custom token address (0x...)"
					/>
				</div>
				<div class="flex flex-col space-y-1.5">
					<Label for="amount">
						Amount:
						<span class="font-normal"> {{ displayTokenAmount }} </span>
					</Label>
					<div class="flex gap-2">
						<Input id="amount" v-model="withdrawAmount" placeholder="wei" />
						<Button variant="outline" class="h-10" :disabled="isMaxBtnDisabled" @click="onClickMax">
							Max
						</Button>
					</div>
				</div>
				<Button
					variant="destructive"
					:loading="isEmergencyWithdrawLoading"
					:disabled="
						isBtnDisabled ||
						!isWithdrawAmountValid ||
						(isCustomTokenSelected && !isAddress(customWithdrawToken))
					"
					@click="onClickEmergencyWithdraw"
				>
					Emergency Withdraw
				</Button>
			</div>
		</CardContent>
	</Card>
</template>
