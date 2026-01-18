import tailwindcss from "@tailwindcss/vite"

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },
  css: ['./app/assets/css/main.css'],
  app: {
    // 关键点 1: 设置为相对路径，这样资源引用会变成 ./_nuxt/...
    baseURL: './',
    // 关键点 2: 显式指定 buildAssetsDir，避免下划线开头的兼容性问题（可选，但推荐）
    buildAssetsDir: 'assets',
  },

  router: {
    options: {
      // 关键点 3: 强制 Hash 模式 (Nuxt 3/4 有时需要这个显式配置)
      hashMode: true
    }
  },

  // 关键点 4: 禁用 Payload 提取，这对 file:// 协议支持不好
  experimental: {
    payloadExtraction: false,
    appManifest: false
  },
  // 移除 router 配置，统一在 app/router.options.ts 中管理
  vite: {
    base: './', // 强制 Vite 使用相对路径，解决 Electron 白屏问题
    plugins: [
      tailwindcss()
    ],
    optimizeDeps: {
      include: ['pdfjs-dist']
    },
  },
})
