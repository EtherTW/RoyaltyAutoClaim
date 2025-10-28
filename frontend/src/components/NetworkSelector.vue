<script setup lang="ts">
import { CHAIN_ID } from '@/config'
import { useBlockchainStore } from '@/stores/useBlockchain'
const blockchainStore = useBlockchainStore()

const CHAIN_NAME: { [key: string]: string } = {
	[CHAIN_ID.LOCAL]: 'Local',
	[CHAIN_ID.SEPOLIA]: 'Sepolia',
	[CHAIN_ID.MAINNET]: 'Mainnet',
	[CHAIN_ID.BASE_SEPOLIA]: 'Base Sepolia',
	[CHAIN_ID.BASE]: 'Base',
} as const
</script>

<template>
	<Select v-model="blockchainStore.chainId">
		<SelectTrigger class="w-[100px]">
			<SelectValue />
		</SelectTrigger>
		<SelectContent>
			<SelectGroup>
				<SelectItem v-for="id in blockchainStore.chainIds" :value="id" :key="id">
					{{ CHAIN_NAME[id] }}
				</SelectItem>
			</SelectGroup>
		</SelectContent>
	</Select>
</template>

<style lang="css"></style>
