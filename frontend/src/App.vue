<template>
  <div id="app">
    <router-view />
    <Dialog
      :visible="dialogStore.visible"
      :title="dialogStore.title"
      :message="dialogStore.message"
      :type="dialogStore.type"
      :details="dialogStore.details"
      :buttons="dialogStore.buttons"
      @close="dialogStore.closeDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { useDialogStore } from './stores/dialog'
import Dialog from './components/Dialog/index.vue'

// 初始化对话框状态管理
const dialogStore = useDialogStore()
</script>

<style scoped>
#app {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}
</style>