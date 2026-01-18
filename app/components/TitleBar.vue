<!-- components/TitleBar.vue -->
<script setup lang="ts">
// ... (保持你的 Script 逻辑不变) ...
// 窗口控制事件
const handleMinimize = () => {
    window.electronAPI?.minimizeWindow?.()
}
const handleMaximize = () => {
    window.electronAPI?.maximizeWindow?.()
}
const handleClose = () => {
    window.electronAPI?.closeWindow?.()
}
const emit = defineEmits<{
    openSettings: []
}>()


const isDark = ref(false) // dark light mode
const isMaximized = ref(false) // 窗口状态
const toggleDark = () => {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark')
}
onMounted(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
        isDark.value = true
        document.documentElement.classList.add('dark')
    }

    if (!window.electronAPI) {
        console.warn('TitleBar: Electron API not available')
        return
    }
    //  监听 Electron 发来的窗口状态变化
    window.electronAPI.onWindowStateChange((state: string) => {
        isMaximized.value = state === 'maximized'
    })
})
</script>

<template>
    <div
        class="h-12 flex justify-between bg-manga-100 dark:bg-manga-800 border-b border-manga-200 dark:border-manga-600 select-none">

        <div class="flex-1 flex items-center gap-4 px-4 draggable h-full">
            <h1 class="text-lg font-bold text-manga-900 dark:text-manga-100">
                📚 MangaReader
            </h1>
        </div>

        <div class="flex items-center gap-2 non-draggable px-2 h-full">
            <Button variant="secondary" size="sm" @btn-click="emit('openSettings')">
                ⚙️ 设置
            </Button>
            <Button size="sm" @btn-click="toggleDark">
                {{ isDark ? '☀️' : '🌙' }}
            </Button>
        </div>

        <!-- 右侧：窗口控制按钮组 -->
        <div class="flex h-full non-draggable">
            <!-- 最小化 -->
            <MinimizeButton @minimize-btn-click="handleMinimize" />

            <!-- 最大化 -->
            <MaximizeButton :is-maximized="isMaximized" @maximize-btn-click="handleMaximize" />

            <!-- 关闭 (特殊样式：背景变红，图标变白) -->
            <CloseButton @close-btn-click="handleClose" />
        </div>
    </div>
</template>

<style scoped>
.draggable {
    -webkit-app-region: drag;
}

.non-draggable {
    -webkit-app-region: no-drag;
}

/* 排除按钮内部元素的拖拽属性，防止点击不灵敏 */
.non-draggable * {
    -webkit-app-region: no-drag;
}
</style>