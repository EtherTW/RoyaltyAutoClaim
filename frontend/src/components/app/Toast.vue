<script setup lang="ts">
import { CircleCheck, CircleX } from 'lucide-vue-next'
import { Toaster } from 'vue-sonner'

const mode = useColorMode()
</script>

<template>
	<Toaster :theme="mode === 'dark' ? 'light' : 'dark'" position="bottom-right" closeButton>
		<template #error-icon>
			<CircleX class="text-red-600 w-[18px] h-[18px] relative left-[1px] top-[.5px]" />
		</template>
		<template #success-icon>
			<CircleCheck class="text-green-600 w-[18px] h-[18px] relative left-[1px] top-[.5px]" />
		</template>
	</Toaster>
</template>

<style lang="css">
[data-sonner-toast][data-styled='true'] [data-close-button] {
	--toast-close-button-transform: translate(285px, -6px);
}

/* Toast width */
[data-sonner-toast] {
	width: 300px; /* the width of the toast */
}
[data-sonner-toaster][data-x-position='right'] {
	width: 280px; /* the distance from the right edge */
}

/* Scrollable content */
[data-sonner-toast] [data-content] {
	max-height: 200px;
	overflow-y: auto;
	padding-right: 4px;
}

/* Align icon to the top */
[data-sonner-toast][data-styled='true'] {
	align-items: flex-start;
}

[data-sonner-toast][data-styled='true'] [data-icon] {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 18px;
	height: 18px;
	margin: 0;
}

/* Disable lift animation */
/* [data-sonner-toast] {
	--lift: 0;
	--lift-amount: 0;
} */
</style>
