import { defineStore } from 'pinia';
import { ref } from 'vue';

// 定义对话框配置类型
export interface DialogConfig {
  title: string;
  message: string;
  type?: 'info' | 'success' | 'error' | 'warning';
  details?: string;
  buttons?: Array<{
    text: string;
    primary?: boolean;
    callback?: () => void | Promise<void>;
  }>;
}

export const useDialogStore = defineStore('dialog', () => {
  // 响应式状态
  const visible = ref(false);
  const title = ref('提示');
  const message = ref('');
  const type = ref<'info' | 'success' | 'error' | 'warning'>('info');
  const details = ref<string | undefined>();
  const buttons = ref<Array<{
    text: string;
    primary?: boolean;
    callback?: () => void;
  }>>([{ text: '确定', primary: true }]);

  // 显示对话框
  const showDialog = (config: DialogConfig) => {
    title.value = config.title;
    message.value = config.message;
    type.value = config.type || 'info';
    details.value = config.details;
    buttons.value = config.buttons || [{ text: '确定', primary: true }];
    visible.value = true;
  };

  // 显示错误对话框
  const showErrorDialog = (message: string, details?: string) => {
    showDialog({
      title: '错误',
      message,
      type: 'error',
      details,
      buttons: [{ text: '确定', primary: true }]
    });
  };

  // 显示成功对话框
  const showSuccessDialog = (message: string) => {
    showDialog({
      title: '成功',
      message,
      type: 'success',
      buttons: [{ text: '确定', primary: true }]
    });
  };

  // 显示警告对话框
  const showWarningDialog = (message: string) => {
    showDialog({
      title: '警告',
      message,
      type: 'warning',
      buttons: [{ text: '确定', primary: true }]
    });
  };

  // 关闭对话框
  const closeDialog = () => {
    visible.value = false;
  };

  return {
    // 状态
    visible,
    title,
    message,
    type,
    details,
    buttons,
    
    // 方法
    showDialog,
    showErrorDialog,
    showSuccessDialog,
    showWarningDialog,
    closeDialog
  };
});
