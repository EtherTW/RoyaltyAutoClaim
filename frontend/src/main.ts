import Notifications, { notify } from '@kyvg/vue3-notification'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { ERROR_NOTIFICATION_DURATION } from './config'
import { normalizeError } from './lib/error'
import router from './router'
import './style.css'
const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(Notifications)

app.mount('#app')

app.config.errorHandler = (error: unknown, _vm, _info) => {
	const err = normalizeError(error)
	console.error(err)

	notify({
		title: `${err.name}: ${err.message}`,
		text: getDetailedErrorMessage(err),
		type: 'error',
		duration: ERROR_NOTIFICATION_DURATION,
	})
}

function getDetailedErrorMessage(err: Error): string {
	let messages: string[] = []

	while (err instanceof Error) {
		messages.push(`${err.name}: ${err.message}`)
		err = err.cause as Error
	}

	messages.shift()

	return messages.join(' → ')
}
