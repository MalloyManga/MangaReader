<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const route = useRoute()
const { images, currentImageIndex, clearImages } = useMangaImages()
const {
    pageStates,
    batchState,
    isProcessing,
    isBatchProcessing,
    isCurrentPageProcessing,
    taskContext,
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
const stageLabels = {
    detecting: t('autoTranslateWorkflow.analyzing'),
    recognizing: t('autoTranslateWorkflow.recognizingText'),
    translating: t('autoTranslateWorkflow.translatingText'),
    complete: t('autoTranslateWorkflow.completed'),
    stopped: t('autoTranslateWorkflow.stopped'),
    error: t('autoTranslateWorkflow.failed'),
    idle: t('autoTranslateWorkflow.preparing')
} as const
const message = computed(() => {
    if (!isProcessing.value) {
        return isBatchTask.value ? batchState.value.message : (currentPageState.value?.message || t('autoTranslateWorkflow.ended'))
    }
    const context = taskContext.value
    const page = context.pageTotal ? t('autoTranslateWorkflow.pageProgress', { current: context.pageIndex, total: context.pageTotal }) : ''
    const region = context.regionTotal ? t('autoTranslateWorkflow.regionBoxProgress', { current: context.regionIndex, total: context.regionTotal }) : ''
    return [page, region, stageLabels[context.stage]].filter(Boolean).join(' · ')
})
const title = computed(() => {
    const bookName = taskContext.value.bookName || t('autoTranslateWorkflow.currentBook')
    if (isBatchProcessing.value || isCurrentPageProcessing.value) return t('autoTranslateWorkflow.processingBook', { name: bookName })
    if (batchState.value.status === 'complete' || currentPageState.value?.stage === 'complete') return t('autoTranslateWorkflow.processingComplete')
    if (currentPageState.value?.stage === 'error') return t('autoTranslateWorkflow.processingFailed')
    return t('autoTranslateWorkflow.processingStopped')
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
                    {{ t('autoTranslateWorkflow.stop') }}
                </button>
                <button v-else type="button" @click="dismiss"
                    class="h-9 rounded-lg border border-manga-200 text-xs font-medium text-manga-600 transition-colors hover:bg-manga-50 dark:border-manga-600 dark:text-manga-300 dark:hover:bg-manga-700">
                    {{ t('common.close') }}
                </button>
                <button type="button" @click="returnToTask"
                    class="h-9 rounded-lg bg-primary text-xs font-bold text-white transition-opacity hover:opacity-90">
                    {{ t('autoTranslateWorkflow.returnToTask') }}
                </button>
            </div>
        </aside>
    </Transition>
</template>
