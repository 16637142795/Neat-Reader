import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('./pages/Home/index.vue')
    },
    {
      path: '/reader/:id',
      name: 'Reader',
      component: () => import('./pages/Reader/index.vue')
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('./pages/Settings/index.vue')
    },
    {
      path: '/file-manager',
      name: 'FileManager',
      component: () => import('./pages/FileManager/index.vue')
    },
    {
      path: '/callback',
      name: 'Callback',
      component: () => import('./pages/Callback/index.vue')
    }
  ]
})

export default router