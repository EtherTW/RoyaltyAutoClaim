import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import Notifications, { notify } from '@kyvg/vue3-notification'
import { ERROR_NOTIFICATION_DURATION } from './config'
import { formatError } from './lib/formatError'
const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(Notifications)

app.mount('#app')

class AppError extends Error {
	constructor(message: string) {
		super(message)
	}
}

app.config.errorHandler = (err: any, _vm, _info) => {
	const appError = new AppError(err)
	console.error(appError)

	notify({
		title: 'Error',
		text: formatError(appError),
		type: 'error',
		duration: ERROR_NOTIFICATION_DURATION,
	})
}
