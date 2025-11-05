<script setup lang="ts">
import { useBlockchainStore } from '@/stores/useBlockchain'
import { useGlobalLoaderStore } from '@/stores/useGlobalLoader'

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

const isDisabled = computed(() => useGlobalLoaderStore().isGlobalLoading)
</script>

<template>
	<Select v-model="selected" :disabled="isDisabled">
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
