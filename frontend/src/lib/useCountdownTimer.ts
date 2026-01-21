import { computed, ref } from 'vue'

const ESTIMATED_EMAIL_OPERATION_TIME = 30 // seconds

export function useCountdownTimer(initialSeconds = ESTIMATED_EMAIL_OPERATION_TIME) {
	const countdown = ref<number>(initialSeconds)
	const timerInterval = ref<NodeJS.Timeout | null>(null)

	function startTimer() {
		countdown.value = initialSeconds
		if (timerInterval.value) {
			clearInterval(timerInterval.value)
		}
		timerInterval.value = setInterval(() => {
			countdown.value--
		}, 1000)
	}

	function stopTimer() {
		if (timerInterval.value) {
			clearInterval(timerInterval.value)
			timerInterval.value = null
		}
		countdown.value = initialSeconds
	}

	const timerDisplay = computed(() => {
		if (countdown.value > 0) {
			return `(${countdown.value}s)`
		} else {
			return `(+${Math.abs(countdown.value)}s)`
		}
	})

	return {
		countdown,
		startTimer,
		stopTimer,
		timerDisplay,
	}
}
