<!-- components/GlobalLoader.vue -->
<script setup lang="ts">
const { showToast } = useToast()
const { openModelFolder } = useSettings()
const isVisible = ref(true)
const isFading = ref(false) // 控制消失动画
const loadingText = ref('Initializing...')
const downloadPercent = ref(0) // 下载进度

// 错误处理状态
const hasError = ref(false)
const errorMessage = ref('')
const errorDetail = ref('')

const emit = defineEmits<{
    ready: []
}>()

const openGithubHelp = () => {
    window.electronAPI.openLink('https://github.com/MalloyManga/MangaReader/blob/main/README.md')
}

// 监听后端状态
onMounted(async () => {

    if (!window.electronAPI) {
        console.warn('Loader: Electron API not available')
        loadingText.value = "Electron API not available"
        finishLoading()
        return
    }
    window.electronAPI.on('backend-status', (data) => {
        console.log('Loader received signal:', data)
        if (data.status === 'ready') {
            finishLoading()
        }
    })
    window.electronAPI.onInitStatus((message: string) => {
        if (!hasError.value) loadingText.value = message
    })

    // 监听初始化下载进度
    window.electronAPI.onInitProgress((data: { percent: number, message: string }) => {
        if (!hasError.value) {
            loadingText.value = `${data.message} (${data.percent}%)`
            downloadPercent.value = data.percent
        }
    })

    // 监听初始化错误
    window.electronAPI.onInitError((data: { message: string, detail: string }) => {
        hasError.value = true
        errorMessage.value = data.message
        errorDetail.value = data.detail
        loadingText.value = "Initialization Failed"
    })

    const isReady = await window.electronAPI.checkBackendReady()
    if (isReady) {
        loadingText.value = "Welcome Back!"
        finishLoading()
    }
    // 超时强制显示 防止后端挂了
    setTimeout(() => {
        if (isVisible.value && !hasError.value) {
            console.warn('Loader: Timeout triggered (Backend slow or failed)')
            finishLoading()
        }
    }, 300000)
})

const finishLoading = () => {
    isFading.value = true
    setTimeout(() => {
        isVisible.value = false
        emit('ready')

        const hasSeenHint = localStorage.getItem('has_seen_intro_hint')
        if (!hasSeenHint) {
            showToast('👋 欢迎使用！建议在【设置】配置翻译模型及阅读模式', 6000)
            localStorage.setItem('has_seen_intro_hint', 'true')
        } else {
            showToast('资源加载完毕 🚀', 2000)
        }
    }, 500)
}
</script>

<template>
    <!-- 全屏遮罩 -->
    <!-- 使用 Teleport 确保它永远在最上层 -->
    <Teleport to="body">
        <Transition enter-active-class="transition duration-300"
            leave-active-class="transition duration-500 ease-in-out" leave-to-class="opacity-0 blur-sm scale-105">
            <div v-if="isVisible"
                class="fixed inset-0 z-9999 flex flex-col items-center justify-center bg-manga-50 dark:bg-manga-800 transition-colors"
                :class="{ 'pointer-events-none': isFading }">
                <!-- 动画容器 (无错误时显示) -->
                <div v-if="!hasError" class="loader-container mb-8">
                    <!-- 跳跃的 あ -->
                    <div class="jumping-char text-4xl font-black text-primary dark:text-blue-400 select-none">
                        あ
                    </div>
                </div>

                <!-- 错误图标 (有错误时显示) -->
                <div v-else class="mb-6 text-red-500 dark:text-red-400">
                    <IconWarn class="size-20" />
                </div>

                <!-- 文字提示 -->
                <div class="text-center space-y-4 w-full max-w-md px-4">
                    <h2 class="text-xl font-bold tracking-widest"
                        :class="hasError ? 'text-red-600 dark:text-red-400' : 'text-manga-900 dark:text-white animate-pulse'">
                        {{ hasError ? 'INITIALIZATION FAILED' : 'MANGA READER' }}
                    </h2>

                    <!-- 正常加载文本 -->
                    <p v-if="!hasError" class="text-sm text-manga-500 dark:text-manga-400 font-mono truncate">
                        {{ loadingText }}
                    </p>

                    <!-- 错误详情与操作 -->
                    <div v-else class="space-y-4">
                        <div
                            class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-800">
                            <p class="font-bold text-red-700 dark:text-red-300 text-sm mb-1">{{ errorMessage }}</p>
                            <p class="text-xs text-red-600 dark:text-red-400">{{ errorDetail }}</p>
                        </div>

                        <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
                            <button @click="openModelFolder"
                                class="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                                <IconFolder class="h-4 w-4" />
                                打开模型文件夹
                            </button>
                            <button @click="openGithubHelp"
                                class="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary-dark transition-colors flex items-center justify-center gap-2">
                                <IconGithub class="h-4 w-4" />
                                查看手动配置教程
                            </button>
                        </div>
                    </div>

                    <!-- 进度条 (仅在下载时显示) -->
                    <div v-if="!hasError && downloadPercent > 0 && downloadPercent < 100"
                        class="w-full h-1.5 bg-manga-200 dark:bg-manga-700 rounded-full overflow-hidden mt-2">
                        <div class="h-full bg-primary transition-all duration-300 ease-out"
                            :style="{ width: `${downloadPercent}%` }"></div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.loader-container {
    position: relative;
    width: 120px;
    height: 90px;
}

/* 1. 跳跃的 あ (对应原来的 loader:before) */
.jumping-char {
    position: absolute;
    bottom: 30px;
    left: 45px;
    /* 微调居中 */
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;

    /* 动画：跳跃 + 形变 */
    animation: jump-bounce 0.5s ease-in-out infinite alternate;
}

/* 2. 滚动的台阶 (对应原来的 loader:after) */
/* 使用伪元素画出台阶阴影 */
.loader-container::after {
    content: "";
    position: absolute;
    right: 0;
    top: 0;
    height: 7px;
    width: 45px;
    border-radius: 4px;
    /* 初始状态的阴影 */
    box-shadow: 0 5px 0 #cbd5e1, -35px 50px 0 #cbd5e1, -70px 95px 0 #cbd5e1;
    animation: step-scroll 1s ease-in-out infinite;
}

/* 深色模式适配 */
:global(.dark) .loader-container::after {
    box-shadow: 0 5px 0 #475569, -35px 50px 0 #475569, -70px 95px 0 #475569;
    animation: step-scroll-dark 1s ease-in-out infinite;
}

/* --- 关键帧定义 --- */

@keyframes jump-bounce {
    0% {
        transform: scale(1, 0.7);
        /* 落地压扁 */
        bottom: 30px;
    }

    40% {
        transform: scale(0.8, 1.2);
        /* 起跳拉长 */
    }

    60% {
        transform: scale(1, 1);
    }

    100% {
        bottom: 120px;
        /* 跳到的最高点 */
        transform: scale(1, 1);
    }
}

/* 浅色模式台阶动画 */
@keyframes step-scroll {
    0% {
        box-shadow: 0 10px 0 rgba(0, 0, 0, 0), 0 10px 0 #cbd5e1, -35px 50px 0 #cbd5e1, -70px 90px 0 #cbd5e1;
    }

    100% {
        box-shadow: 0 10px 0 #cbd5e1, -35px 50px 0 #cbd5e1, -70px 90px 0 #cbd5e1, -70px 90px 0 rgba(0, 0, 0, 0);
    }
}

/* 深色模式台阶动画 (颜色不同) */
@keyframes step-scroll-dark {
    0% {
        box-shadow: 0 10px 0 rgba(0, 0, 0, 0), 0 10px 0 #475569, -35px 50px 0 #475569, -70px 90px 0 #475569;
    }

    100% {
        box-shadow: 0 10px 0 #475569, -35px 50px 0 #475569, -70px 90px 0 #475569, -70px 90px 0 rgba(0, 0, 0, 0);
    }
}
</style>
