import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import Notifications from '@kyvg/vue3-notification'

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)
app.use(Notifications)

app.mount('#app')
