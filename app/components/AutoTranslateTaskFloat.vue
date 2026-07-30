<script setup lang="ts">
const route = useRoute()
const { images, currentImageIndex, clearImages } = useMangaImages()
const {
    pageStates,
    batchState,
    isProcessing,
    isBatchProcessing,
    isCurrentPageProcessing,
    resetSession
} = useAutoTranslateSession()

const currentImageId = computed(() => images.value[currentImageIndex.value]?.id)
const currentPageState = computed(() => currentImageId.value ? pageStates.value[currentImageId.value] : undefined)
const isBatchTask = computed(() => batchState.value.show)
const hasSingleResult = computed(() => !isBatchTask.value
    && Boolean(currentPageState.value)
    && currentPageState.value?.stage !== 'idle')
const visible = computed(() => route.path !== '/auto-translate' && (
    isProcessing.value
    || (isBatchTask.value && batchState.value.status !== 'idle')
    || hasSingleResult.value
))
const progress = computed(() => isBatchTask.value
    ? batchState.value.progress
    : (currentPageState.value?.progress || 0))
const message = computed(() => isBatchTask.value
    ? batchState.value.message
    : (currentPageState.value?.message || '正在处理当前页面'))
const title = computed(() => {
    if (isBatchProcessing.value) return `正在处理第 ${batchState.value.pageIndex} / ${batchState.value.pageTotal} 页`
    if (isCurrentPageProcessing.value) return '正在处理当前页面'
    if (batchState.value.status === 'complete' || currentPageState.value?.stage === 'complete') return '自动识别处理完成'
    if (currentPageState.value?.stage === 'error') return '自动识别处理失败'
    return '自动识别已停止'
})

const returnToTask = () => navigateTo('/auto-translate')
const stopTask = () => stopActiveAutoTranslateTask()
const dismiss = () => {
    if (isProcessing.value) return
    clearImages()
    resetSession()
}
</script>

<template>
    <Transition enter-active-class="transition duration-200 ease-out"
        leave-active-class="transition duration-150 ease-in"
        enter-from-class="translate-y-3 opacity-0" leave-to-class="translate-y-3 opacity-0">
        <aside v-if="visible"
            class="fixed bottom-5 right-5 z-50 w-80 rounded-xl border border-manga-200 bg-white p-4 shadow-xl dark:border-manga-600 dark:bg-manga-800">
            <div class="flex items-start gap-3">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <IconAutoDetect class="size-5" />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-3">
                        <h2 class="truncate text-sm font-bold text-manga-900 dark:text-manga-100">{{ title }}</h2>
                        <span class="shrink-0 text-xs tabular-nums text-manga-500">{{ progress }}%</span>
                    </div>
                    <p class="mt-1 truncate text-xs text-manga-500 dark:text-manga-400" :title="message">{{ message }}</p>
                </div>
            </div>

            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-manga-100 dark:bg-manga-700">
                <div class="h-full rounded-full bg-primary transition-all duration-300"
                    :style="{ width: `${progress}%` }" />
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2">
                <button v-if="isProcessing" type="button" @click="stopTask"
                    class="h-9 rounded-lg border border-red-200 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20">
                    停止处理
                </button>
                <button v-else type="button" @click="dismiss"
                    class="h-9 rounded-lg border border-manga-200 text-xs font-medium text-manga-600 transition-colors hover:bg-manga-50 dark:border-manga-600 dark:text-manga-300 dark:hover:bg-manga-700">
                    关闭
                </button>
                <button type="button" @click="returnToTask"
                    class="h-9 rounded-lg bg-primary text-xs font-bold text-white transition-opacity hover:opacity-90">
                    返回查看
                </button>
            </div>
        </aside>
    </Transition>
</template>
