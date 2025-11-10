<!-- app.vue -->
<script setup lang="ts">
// 深色模式切换（后期实现）
const isDark = ref(false)

const toggleDarkMode = () => {
	isDark.value = !isDark.value
	if (isDark.value) {
		document.documentElement.classList.add('dark')
	} else {
		document.documentElement.classList.remove('dark')
	}
}

// 监听系统主题偏好
onMounted(() => {
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
	if (prefersDark) {
		isDark.value = true
		document.documentElement.classList.add('dark')
	}
})
</script>

<template>
	<div class="min-h-screen transition-colors duration-manga">
		<NuxtPage />
	</div>
</template>
