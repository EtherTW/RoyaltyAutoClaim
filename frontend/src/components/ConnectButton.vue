<script setup lang="ts">
import { shortenAddress, useVueDapp } from '@vue-dapp/core'
import { useVueDappModal } from '@vue-dapp/modal'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { Copy, Check, LogOut } from 'lucide-vue-next'

const { disconnect, status, isConnected, address } = useVueDapp()

function onClickConnect() {
	const { open } = useVueDappModal()
	open()
}

function onClickDisconnect() {
	disconnect()
}

const isCopied = ref(false)
function onClickCopyAddress() {
	navigator.clipboard.writeText(address.value || '')
	isCopied.value = true
	setTimeout(() => {
		isCopied.value = false
	}, 500)
}

const breakpoints = useBreakpoints(breakpointsTailwind)
</script>

<template>
	<div>
		<div v-if="isConnected" class="flex items-center flex-col">
			<div
				class="h-[36px] rounded-3xl flex sm:inline-flex items-center bg-gray-100 sm:px-4 sm:gap-x-2"
				:class="{
					'px-3 gap-x-1': breakpoints.isSmaller('sm'),
				}"
			>
				<!-- Address -->
				<p class="text-sm">{{ address ? shortenAddress(address, 6, 2) : '' }}</p>

				<!-- Copy Button -->
				<Button class="address-button" variant="link" size="icon" @click="onClickCopyAddress">
					<Transition name="fade" mode="out-in">
						<Copy v-if="!isCopied" key="copy" class="address-button-icon" />
						<Check v-else key="check" class="address-button-icon" />
					</Transition>
				</Button>

				<!-- Disconnect Button -->
				<Button class="address-button" variant="link" size="icon" @click="onClickDisconnect">
					<LogOut />
				</Button>
			</div>
		</div>

		<Button v-else @click="onClickConnect" :disabled="status === 'connecting'">
			{{ status === 'connecting' ? 'Connecting...' : '' }}
			<div v-if="status !== 'connecting'">Connect</div>
		</Button>
	</div>
</template>

<style lang="css">
.address-button {
	@apply w-5 h-5 rounded-full bg-gray-100;
}

.address-button:hover {
	@apply bg-gray-50;
}

.address-button-icon {
	@apply w-3 h-3;
}
</style>
