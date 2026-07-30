<script setup lang="ts">
import type { AutoTranslatePageState } from '~/composables/useAutoTranslateProcessing'

const props = defineProps<{
    state: AutoTranslatePageState
    detectorAvailable: boolean
    translationReady: boolean
    translationMessage: string
    hasImages: boolean
    isProcessing: boolean
    isOcrMode: boolean
    isOcrRecognizing: boolean
}>()

const emit = defineEmits<{
    process: []
    manualOcr: []
}>()

const stageLabel = computed(() => ({
    idle: '等待处理',
    detecting: '检测文字区域',
    recognizing: '识别原文',
    translating: '翻译文本',
    complete: '处理完成',
    error: '处理失败'
}[props.state.stage]))
</script>

<template>
    <section class="shrink-0 bg-white dark:bg-manga-800 border border-manga-200 dark:border-manga-600 rounded-primary shadow-sm p-5">
        <div class="flex items-center justify-between gap-4 mb-4">
            <div class="flex items-center gap-2 text-manga-900 dark:text-manga-100">
                <IconAutoDetect class="size-6 text-primary" />
                <h1 class="font-bold text-lg">自动识别翻译</h1>
            </div>
            <span class="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium"
                :class="detectorAvailable
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300'">
                {{ detectorAvailable ? '检测器可用' : '检测模块未安装' }}
            </span>
        </div>

        <div class="flex items-center justify-between text-xs mb-2">
            <span class="font-medium text-manga-700 dark:text-manga-300">{{ stageLabel }}</span>
            <span class="tabular-nums text-manga-500">{{ state.progress }}%</span>
        </div>
        <div class="h-2 bg-manga-100 dark:bg-manga-700 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-300"
                :class="state.stage === 'error' ? 'bg-red-500' : 'bg-primary'"
                :style="{ width: `${state.progress}%` }" />
        </div>
        <p class="text-xs text-manga-500 dark:text-manga-400 mt-2 min-h-4">{{ state.message }}</p>

        <p class="mt-3 text-xs min-h-4"
            :class="translationReady ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">
            {{ translationMessage }}
        </p>

        <button type="button" :disabled="!hasImages || isProcessing || !detectorAvailable || !translationReady"
            class="mt-4 w-full min-h-11 rounded-primary bg-primary text-white font-bold flex items-center justify-center gap-2 transition-all enabled:hover:opacity-90 enabled:hover:-translate-y-px disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            @click="emit('process')">
            <IconAutoDetect class="size-5" />
            {{ isProcessing ? '正在处理当前页' : '处理当前页' }}
        </button>

        <div class="mt-3">
            <OcrButton :is-recognizing="isOcrRecognizing || isProcessing" :is-in-ocr="isOcrMode"
                @ocr-btn-click="emit('manualOcr')" />
        </div>
    </section>
</template>
