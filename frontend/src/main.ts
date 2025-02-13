import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import Notifications, { notify } from '@kyvg/vue3-notification'
import { ERROR_NOTIFICATION_DURATION } from './config'
import { formatErrMsg, normalizeError, AppError } from './lib/error'
const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(Notifications)

app.mount('#app')

app.config.errorHandler = (error: unknown, _vm, _info) => {
	const err = normalizeError(error)
	const appError = new AppError(err.message, { cause: err })
	console.error(appError)

	notify({
		title: 'App Error',
		text: formatErrMsg(appError),
		type: 'error',
		duration: ERROR_NOTIFICATION_DURATION,
	})
}
