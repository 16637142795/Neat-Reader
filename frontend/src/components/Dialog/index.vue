<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-container" :class="{ 'dialog-error': type === 'error', 'dialog-success': type === 'success', 'dialog-warning': type === 'warning' }">
          <div class="dialog-header">
            <h3 class="dialog-title">{{ title }}</h3>
            <button class="dialog-close-btn" @click="handleClose">&times;</button>
          </div>
          <div class="dialog-body">
            <p class="dialog-message">{{ message }}</p>
            <div v-if="details" class="dialog-details">
              <pre>{{ details }}</pre>
            </div>
          </div>
          <div class="dialog-footer">
            <button 
              v-for="button in buttons" 
              :key="button.text"
              class="dialog-btn"
              :class="{ 'btn-primary': button.primary }"
              @click="() => handleButtonClick(button)"
            >
              {{ button.text }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

// 对话框类型
export type DialogType = 'info' | 'success' | 'error' | 'warning';

// 按钮配置
export interface DialogButton {
  text: string;
  primary?: boolean;
  callback?: () => void | Promise<void>;
}

// 属性定义
const props = defineProps<{
  visible: boolean;
  title: string;
  message: string;
  type?: DialogType;
  details?: string;
  buttons?: DialogButton[];
}>();

// 事件定义
const emit = defineEmits<{
  close: [];
  buttonClick: [button: DialogButton];
}>();

// 默认属性 - 使用本地状态避免响应式丢失
const type = ref<DialogType>('info');
const buttons = ref<DialogButton[]>([{ text: '确定', primary: true }]);

// 监听 props 变化，更新本地状态
watch(() => props.type, (newType) => {
  if (newType) {
    type.value = newType;
  }
}, { immediate: true });

watch(() => props.buttons, (newButtons) => {
  if (newButtons && newButtons.length > 0) {
    buttons.value = newButtons;
  }
}, { immediate: true });

// 方法
const handleClose = () => {
  emit('close');
};

const handleButtonClick = async (button: DialogButton) => {
  if (button.callback) {
    await button.callback();
  }
  emit('buttonClick', button);
  emit('close');
};
</script>

<style scoped>
/* 遮罩层 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

/* 对话框容器 */
.dialog-container {
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  max-width: 500px;
  width: 90%;
  overflow: hidden;
  animation: dialogFadeIn 0.3s ease;
}

/* 对话框类型样式 */
.dialog-error {
  border-left: 4px solid #EF4444;
}

.dialog-success {
  border-left: 4px solid #10B981;
}

.dialog-warning {
  border-left: 4px solid #F59E0B;
}

/* 过渡动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: all 0.3s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-from .dialog-container,
.dialog-fade-leave-to .dialog-container {
  transform: translateY(-20px);
}

/* 淡入动画 */
@keyframes dialogFadeIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 头部 */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #E5E7EB;
  background-color: #F9FAFB;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.dialog-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #6B7280;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.dialog-close-btn:hover {
  background-color: #E5E7EB;
  color: #374151;
}

/* 内容 */
.dialog-body {
  padding: 24px;
}

.dialog-message {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #4B5563;
  line-height: 1.5;
}

.dialog-details {
  background-color: #F3F4F6;
  border-radius: 8px;
  padding: 16px;
  margin: 16px 0 0 0;
  overflow: auto;
  max-height: 200px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  color: #374151;
}

.dialog-details pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

/* 底部 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #E5E7EB;
  background-color: #F9FAFB;
}

/* 按钮 */
.dialog-btn {
  padding: 8px 16px;
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  background-color: white;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dialog-btn:hover {
  background-color: #F9FAFB;
  border-color: #9CA3AF;
}

.dialog-btn.btn-primary {
  background-color: #4A90E2;
  border-color: #4A90E2;
  color: white;
}

.dialog-btn.btn-primary:hover {
  background-color: #357ABD;
  border-color: #357ABD;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .dialog-container {
    width: 95%;
    margin: 16px;
  }
  
  .dialog-header,
  .dialog-body,
  .dialog-footer {
    padding: 16px;
  }
  
  .dialog-footer {
    flex-direction: column;
  }
  
  .dialog-btn {
    width: 100%;
  }
}
</style>