<!-- app.vue -->
<script setup lang="ts">
const router = useRouter()
const route = useRoute()
const isAppReady = ref(false)

const handleAppReady = () => {
	isAppReady.value = true
}

onMounted(() => {
	document.title = 'Manga Reader'

	// 调试日志
	console.log('🚀 App Launched. Initial Route:', route.fullPath)

	if (window.electronAPI?.onBackendLog) {
		window.electronAPI.onBackendLog((msg: string) => {
			console.log('%c[Backend]', 'color: #bada55', msg)
		})
	}

	// [恢复并修复] 生产环境路径修正逻辑
	// 为了防止 Electron 打包后出现文件路径作为路由的情况 (如 /E:/...)
	// 修复关键：只检查 route.path (不包含 query 参数)，避免误伤带有 path 参数的正常页面
	if (route.path.includes('index.html') || route.path.includes(':')) {
		console.log('🚨 [App] 检测到非法文件路径路由，正在强制重定向到首页...', route.path)
		router.replace('/')
	}
})
</script>

<template>
	<div class="min-h-screen transition-colors">
		<GlobalLoader v-if="!isAppReady" @ready="handleAppReady" />
		<AutoTranslateTaskFloat />
		<div>
			<NuxtPage />
		</div>
	</div>
</template>
