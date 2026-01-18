<!-- app.vue -->
<script setup lang="ts">
const router = useRouter()
const route = useRoute()

onMounted(() => {
	document.title = 'Manga Reader'

	// 调试日志：看看 Electron 到底把路由识别成了什么鬼样子
	console.log('🚀 App Launched. Initial Route:', route.fullPath)

	// 监听后端日志并打印到控制台
	if ((window as any).electronAPI?.onBackendLog) {
		(window as any).electronAPI.onBackendLog((msg: string) => {
			console.log('%c[Backend]', 'color: #bada55', msg)
		})
	}

	// 核心修复逻辑：
	// 1. 如果路由包含 'index.html' (Electron 典型特征)
	// 2. 或者路由包含盘符 'E:' (你的报错特征)
	// 3. 或者路由包含 '%3A' (冒号的转义)
	if (route.fullPath.includes('index.html') || route.fullPath.includes(':') || route.fullPath.includes('%3A')) {
		console.log('🚨 检测到非法文件路径路由，正在强制重定向到首页...')

		// 强制替换为根路径，并不产生历史记录
		router.replace('/')
	}
})
</script>

<template>
	<div class="min-h-screen transition-colors">
		<NuxtPage />
	</div>
</template>
