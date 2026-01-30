import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/styles/global.css'
import { wails } from './wails'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

wails.init().then(() => {
  console.log('Wails initialized');
}).catch((err) => {
  console.warn('Wails initialization failed:', err);
});
