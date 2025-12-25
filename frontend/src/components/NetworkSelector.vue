<script setup lang="ts">
import {
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET,
	ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA,
} from '@/config'
import { useBlockchainStore } from '@/stores/useBlockchain'
import { useGlobalLoaderStore } from '@/stores/useGlobalLoader'

const blockchainStore = useBlockchainStore()
const route = useRoute()

// Determine if we're on v1 or v2
const isV1 = computed(() => route.path.includes('v1'))

// Build items array based on version and available addresses
const items = computed(() => {
	const availableItems: string[] = []

	if (isV1.value) {
		// v1 networks: Mainnet (Production) and Sepolia (Testing)
		if (ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_MAINNET) availableItems.push('Production')
		if (ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_SEPOLIA) availableItems.push('Testing')
	} else {
		// v2 networks: Base (Production) and Base Sepolia (Testing)
		if (ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE) availableItems.push('Production')
		if (ROYALTY_AUTO_CLAIM_PROXY_ADDRESS_BASE_SEPOLIA) availableItems.push('Testing')
	}

	return availableItems
})

// Check out onMounted in HomePageV1.vue and HomePage.vue for handling missing address issue
const selected = computed({
	get: () => (blockchainStore.isTestnet ? 'Testing' : 'Production'),
	set: (value: string) => {
		if (value === 'Production') {
			blockchainStore.setIsTestnet(false)
		} else {
			blockchainStore.setIsTestnet(true)
		}
		window.location.reload()
	},
})

const isDisabled = computed(() => useGlobalLoaderStore().isGlobalLoading)
</script>

<template>
	<Select v-model="selected" :disabled="isDisabled">
		<SelectTrigger class="w-[120px]">
			<SelectValue />
		</SelectTrigger>
		<SelectContent v-if="items.length > 0">
			<SelectGroup>
				<SelectItem v-for="item in items" :value="item" :key="item">
					{{ item }}
				</SelectItem>
			</SelectGroup>
		</SelectContent>
	</Select>
</template>

<style lang="css"></style>
