import tailwindcss from "@tailwindcss/vite"

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },
  css: ['./app/assets/css/main.css'],
  app: {
    // 相对 base 路径: 构建产物需要 ./ 才能在 Electron file:// 下解析资源
    // 注意 nuxt/nuxt#28474: 这里直接写 ./ 在 generate 时会被忽略
    // 实际生效机制是 scripts/build.mjs 注入 NUXT_APP_BASE_URL 环境变量
    baseURL: './',
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
