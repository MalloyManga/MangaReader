<!-- components/Nav.vue -->
<script setup lang="ts">
const isDark = ref(false)
const toggleDark = () => {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark')
}

const emit = defineEmits<{
    openSettings: []
}>()

onMounted(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
        isDark.value = true
        document.documentElement.classList.add('dark')
    }
})

const handleSettings = () => {
    emit('openSettings')
}
</script>

<template>
    <div class="flex items-center justify-between max-w-screen-2xl mx-auto">
        <div class="flex items-center gap-6">
            <h1 class="text-2xl font-bold text-manga-900 dark:text-manga-100">
                📚 MangaReader
            </h1>
        </div>
        <div class="flex items-center gap-3">
            <Button variant="secondary" size="sm" @btn-click="handleSettings">
                ⚙️ 设置
            </Button>
            <Button size="sm" @btn-click="toggleDark">
                <!-- 模式切换按钮 -->
                {{ isDark ? '☀️' : '🌙' }}
            </Button>
        </div>
    </div>
</template>
