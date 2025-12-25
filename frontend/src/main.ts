import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp } from 'vue'
import { toast } from 'vue-sonner'
import App from './App.vue'
import { normalizeError } from './lib/error'
import router from './router'

import './style.css'

const app = createApp(App)

// pinia
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

app.use(router)

app.mount('#app')

app.config.errorHandler = (error: unknown, _vm, _info) => {
	console.error(error)
	toast.error(normalizeError(error).message, {
		duration: Infinity,
	})
}
