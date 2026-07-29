<!-- components/SettingsModal.vue -->
<script setup lang="ts">
import SettingsGeneral from './SettingsGeneral.vue'
import SettingsTranslate from './SettingsTranslate.vue'
import SettingsDetection from './SettingsDetection.vue'
import SettingsAbout from './SettingsAbout.vue'

// 接收一个布尔值控制显示隐藏
interface Props {
    show: boolean
}
defineProps<Props>()
// 当前选中的 Tab
type TabType = 'general' | 'translate' | 'detection' | 'about'
interface MenuItem {
    id: TabType,
    label: string,
    icon: string
}
const currentTab = ref<TabType>('general')

// 侧边栏菜单配置
const menuItems: MenuItem[] = [
    { id: 'general', label: '常规设置', icon: 'CogIcon' },
    { id: 'translate', label: '翻译模型', icon: 'LanguageIcon' },
    { id: 'detection', label: '自动检测', icon: 'AutoDetectIcon' },
    { id: 'about', label: '关于', icon: 'InfoIcon' },
]

const emit = defineEmits<{
    close: []
}>()

const handleClose = () => {
    emit('close')
}
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-50 flex items-center justify-center" :class="{ 'pointer-events-none': !show }">

            <!-- 背景黑色透明遮罩 -->
            <Transition enter-active-class="transition duration-200 ease-out"
                leave-active-class="transition duration-150 ease-in" enter-from-class="opacity-0"
                leave-to-class="opacity-0" enter-to-class="opacity-100" leave-from-class="opacity-100">
                <div v-if="show" class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="handleClose"></div>
            </Transition>

            <!-- 弹窗内容主体 -->
            <Transition enter-active-class="transition duration-300 ease-out delay-75"
                leave-active-class="transition duration-150 ease-in" enter-from-class="opacity-0 scale-95 translate-y-4"
                leave-to-class="opacity-0 scale-95 translate-y-4" enter-to-class="opacity-100 scale-100 translate-y-0"
                leave-from-class="opacity-100 scale-100 translate-y-0">

                <div v-if="show"
                    class="relative w-full max-w-2xl h-[600px] bg-white dark:bg-manga-800 rounded-xl shadow-2xl border border-manga-200 dark:border-manga-700 flex overflow-hidden">

                    <!-- 左侧tab边栏 -->
                    <div
                        class="w-48 bg-manga-50 dark:bg-manga-900 border-r border-manga-200 dark:border-manga-700 flex flex-col pt-6 pb-4">
                        <div class="px-6 mb-6">
                            <h2 class="text-xl font-bold text-manga-900 dark:text-white">设置</h2>
                        </div>

                        <nav class="flex-1 px-3 space-y-1">
                            <button v-for="item in menuItems" :key="item.id" @click="currentTab = item.id"
                                class="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer"
                                :class="[
                                    currentTab === item.id
                                        ? 'bg-white dark:bg-manga-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                                        : 'text-manga-500 dark:text-manga-400 hover:bg-manga-100 dark:hover:bg-manga-800 hover:text-manga-900 dark:hover:text-manga-200'
                                ]">
                                <IconCog v-if="item.id === 'general'" class="size-5" />
                                <IconTranslate v-else-if="item.id === 'translate'" class="size-5" />
                                <IconAutoDetect v-else-if="item.id === 'detection'" class="size-5" />
                                <IconInfo v-else class="size-5" />
                                {{ item.label }}
                            </button>
                        </nav>
                    </div>

                    <!-- 右侧内容区域 -->
                    <div class="flex-1 bg-white dark:bg-manga-800 flex flex-col min-w-0">

                        <div class="absolute top-4 right-4 z-10">
                            <SettingsCloseButton @settings-close-btn-click="handleClose" />
                        </div>

                        <div class="flex-1 overflow-y-auto custom-scrollbar p-8">
                            <Transition enter-active-class="transition duration-200 ease-out"
                                enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
                                mode="out-in">
                                <component :is="currentTab === 'general' ? SettingsGeneral
                                    : currentTab === 'translate' ? SettingsTranslate
                                        : currentTab === 'detection' ? SettingsDetection
                                            : SettingsAbout" />
                            </Transition>
                        </div>
                    </div>
                </div>
            </Transition>
        </div>
    </Teleport>
</template>

<style scoped>
/* 可选：为滚动条添加一点样式 */
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 20px;
}
</style>
