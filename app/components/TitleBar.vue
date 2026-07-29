<!-- components/TitleBar.vue -->
<script setup lang="ts">
withDefaults(defineProps<{
    useSvgIcons?: boolean
}>(), {
    useSvgIcons: false
})

const isDark = ref(false)
const isMaximized = ref(false)

// 窗口控制事件
const handleMinimize = () => {
    window.electronAPI.minimizeWindow()
}
const handleMaximize = () => {
    window.electronAPI.maximizeWindow()
}
const handleClose = () => {
    window.electronAPI.closeWindow()
}
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

        <div class="draggable flex-1 flex items-center gap-4 px-4 h-full">
            <h1 class="text-lg font-bold text-manga-900 dark:text-manga-100">
                <span v-if="useSvgIcons" class="flex items-center gap-2">
                    <IconBook class="size-5 text-primary" />
                    MangaReader
                </span>
                <template v-else>📚 MangaReader</template>
            </h1>
        </div>

        <div class="non-draggable flex items-center gap-2 px-2 h-full">
            <slot name="extra-buttons"></slot>
            <Button variant="secondary" size="sm" @btn-click="emit('openSettings')">
                <span v-if="useSvgIcons" class="flex items-center gap-1.5">
                    <IconCog class="size-4" />
                    设置
                </span>
                <template v-else>⚙️ 设置</template>
            </Button>
            <Button size="sm" @btn-click="toggleDark">
                <template v-if="useSvgIcons">
                    <IconSun v-if="isDark" class="size-5" />
                    <IconMoon v-else class="size-5" />
                    <span class="sr-only">切换主题</span>
                </template>
                <template v-else>{{ isDark ? '☀️' : '🌙' }}</template>
            </Button>
        </div>

        <!-- 窗口控制按钮组 -->
        <div class="non-draggable flex h-full">
            <MinimizeButton @minimize-btn-click="handleMinimize" />
            <MaximizeButton :is-maximized="isMaximized" @maximize-btn-click="handleMaximize" />
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
