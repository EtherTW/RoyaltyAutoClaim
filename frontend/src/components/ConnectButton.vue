<script setup lang="ts">
import { shortenAddress, useVueDapp } from '@vue-dapp/core'
import { useVueDappModal } from '@vue-dapp/modal'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { LogOut } from 'lucide-vue-next'
import CopyButton from './CopyButton.vue'

const { disconnect, status, isConnected, address } = useVueDapp()

function onClickConnect() {
	const { open } = useVueDappModal()
	open()
}

function onClickDisconnect() {
	disconnect()
}

const breakpoints = useBreakpoints(breakpointsTailwind)
</script>

<template>
	<div id="connect-button">
		<div v-if="isConnected" class="flex items-center flex-col">
			<div
				class="h-[36px] rounded-3xl flex sm:inline-flex items-center bg-gray-200 dark:bg-gray-700 pl-3.5 pr-1.5 sm:gap-x-2"
				:class="{
					'gap-x-1': breakpoints.isSmaller('sm'),
				}"
			>
				<!-- Address -->
				<p class="text-sm">{{ address ? shortenAddress(address, 6, 2) : '' }}</p>

				<div class="flex gap-1 items-center">
					<!-- Copy Button -->
					<CopyButton size="sm" :address="address ? address : ''" />

					<!-- Disconnect Button -->
					<div
						class="w-5 h-5 text-black flex items-center justify-center hover:cursor-pointer rounded-full bg-gray-100 hover:bg-gray-50"
						@click="onClickDisconnect"
					>
						<LogOut class="w-2.5" />
					</div>
				</div>
			</div>
		</div>

		<Button v-else @click="onClickConnect" :disabled="status === 'connecting'">
			{{ status === 'connecting' ? 'Connecting...' : '' }}
			<div v-if="status !== 'connecting'">Connect</div>
		</Button>
	</div>
</template>

<style lang="css">
#connect-button .address-button {
	@apply w-6 h-6 rounded-full flex items-center justify-center text-primary;
}

#connect-button .address-button:hover {
	@apply bg-gray-50 cursor-pointer;
}

#connect-button .address-button-icon {
	@apply w-3;
}
</style>
