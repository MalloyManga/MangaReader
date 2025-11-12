<!-- components/Nav.vue -->
<script setup lang="ts">
// dark light mode 切换 同时检测用户浏览器的明暗模式设置
const isDark = ref(false)
const toggleDark = () => {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark')
}
onMounted(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
        isDark.value = true
        // document.documentElement 选取html 根元素 符合v4最佳实践
        document.documentElement.classList.add('dark')
    }
})

const handleSettings = () => console.log('打开设置')
const handleVocabulary = () => console.log('打开生词本')
</script>

<template>
    <div class="flex items-center justify-between max-w-screen-2xl mx-auto">
        <div class="flex items-center gap-6">
            <h1 class="text-2xl font-bold text-manga-900 dark:text-manga-100">📚 MangaReader</h1>
        </div>
        <div class="flex items-center gap-3">
            <Button variant="secondary" size="sm" @click="handleVocabulary">📖 生词本</Button>
            <Button variant="secondary" size="sm" @click="handleSettings">⚙️ 设置</Button>
            <Button size="sm" @click="toggleDark">
                <!-- 模式切换按钮 -->
                {{ isDark ? '☀️' : '🌙' }}
            </Button>
        </div>
    </div>
</template>
