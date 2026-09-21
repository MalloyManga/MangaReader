import type { RouterConfig } from '@nuxt/schema'
import { createWebHashHistory } from 'vue-router'

// 强制使用 Hash 模式 适配 Electron 文件系统环境
export default <RouterConfig>{
  // 显式传入空字符串 忽略任何 base 设置 防止 Electron 文件路径干扰
  history: () => {
    console.log('🚀 Router Options Loaded: Using createWebHashHistory("")')
    return createWebHashHistory('')
  }
}