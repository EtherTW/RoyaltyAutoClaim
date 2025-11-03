<script setup lang="ts">
import { useBlockchainStore } from '@/stores/useBlockchain'

const blockchainStore = useBlockchainStore()

const items = ['Production', 'Testing']

const selected = ref(blockchainStore.isTestnet ? 'Testing' : 'Production')

watch(selected, () => {
	if (selected.value === 'Production') {
		blockchainStore.setIsTestnet(false)
	} else {
		blockchainStore.setIsTestnet(true)
	}
	window.location.reload()
})
</script>

<template>
	<Select v-model="selected">
		<SelectTrigger class="w-[120px]">
			<SelectValue />
		</SelectTrigger>
		<SelectContent>
			<SelectGroup>
				<SelectItem v-for="item in items" :value="item" :key="item">
					{{ item }}
				</SelectItem>
			</SelectGroup>
		</SelectContent>
	</Select>
</template>

<style lang="css"></style>
