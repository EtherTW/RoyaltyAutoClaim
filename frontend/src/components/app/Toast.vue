<script setup lang="ts">
import { CircleCheck, CircleX } from 'lucide-vue-next'
import { Toaster } from 'vue-sonner'

const mode = useColorMode()

// Test toast UI
// import { toast } from 'vue-sonner'
// onMounted(() => {
// 	toast.success('Successfully Mounted', {
// 		description: h(
// 			'a',
// 			{
// 				class: 'text-blue-700 hover:underline cursor-pointer',
// 				href: '#',
// 				target: '_blank',
// 			},
// 			'View on Explorer',
// 		),
// 		duration: Infinity,
// 	})
// })
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
/* ============================================
     CUSTOM TOAST STYLING - BOTTOM RIGHT POSITION
     ============================================ */

/* Make the close button positioned on the top right corner of the toast */
[data-sonner-toast][data-styled='true'] [data-close-button] {
	/* Moves the close button to align with the right edge of 300px toast */
	/* translateX(285px) positions it at the right, translateY(-6px) moves it up slightly */
	--toast-close-button-transform: translate(285px, -6px) !important;
}

/* Fix close button background color for light theme toast */
[data-sonner-toaster][data-theme='light'] [data-close-button] {
	border: 1px solid rgb(200, 200, 200) !important;
}

/* Close button hover state for light theme */
[data-sonner-toaster][data-theme='light'] [data-close-button]:hover {
	background: rgb(240, 240, 240) !important;
}

/* Fix close button background color for dark theme toast */
[data-sonner-toaster][data-theme='dark'] [data-close-button] {
	background: rgb(38, 38, 38) !important;
	border: 1px solid rgb(100, 100, 100) !important;
	color: white !important;
}

/* Close button hover state for dark theme */
[data-sonner-toaster][data-theme='dark'] [data-close-button]:hover {
	background: rgb(50, 50, 50) !important;
}

/* Set a fixed toast width instead of using the default 356px */
[data-sonner-toast] {
	width: 300px !important; /* Custom width for each individual toast */
}

/* Control the toaster container positioning from the right edge */
[data-sonner-toaster][data-x-position='right'] {
	/* This acts as the right margin/offset from the viewport edge */
	/* The actual toast will appear 280px from the right edge of the screen */
	width: 280px !important;
}

/* ============================================
     MOBILE OVERRIDES (screens <= 600px)
     Override default mobile behavior that makes toasts full-width
     ============================================ */
@media (max-width: 600px) {
	[data-sonner-toaster] {
		/* Remove the default left positioning that centers toasts on mobile */
		left: auto !important;
		/* Keep toasts 32px from the right edge on mobile devices */
		right: 32px !important;
	}

	[data-sonner-toaster][data-y-position='bottom'] {
		/* Position toasts 32px from the bottom on mobile (default is 20px) */
		bottom: 32px !important;
	}

	[data-sonner-toaster] [data-sonner-toast] {
		/* Override the default mobile full-width behavior */
		/* Keep the same 300px width as desktop instead of calc(100% - 32px) */
		width: 300px !important;
	}
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
