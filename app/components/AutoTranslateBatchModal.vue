<script setup lang="ts">
import type { AutoTranslateBatchState } from '~/composables/useAutoTranslateProcessing'

defineProps<{
    state: AutoTranslateBatchState
    isProcessing: boolean
    isStopping: boolean
}>()

const emit = defineEmits<{
    stop: []
    close: []
}>()
</script>

<template>
    <Teleport to="body">
        <Transition enter-active-class="transition duration-200 ease-out"
            leave-active-class="transition duration-150 ease-in" enter-from-class="opacity-0"
            leave-to-class="opacity-0">
            <div v-if="state.show"
                class="fixed inset-0 z-60 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
                <section
                    class="w-full max-w-lg rounded-primary border border-manga-200 dark:border-manga-600 bg-white dark:bg-manga-800 shadow-2xl p-6">
                    <div class="flex items-center gap-3">
                        <IconAutoDetect class="size-7 shrink-0 text-primary" />
                        <div class="min-w-0">
                            <h2 class="text-lg font-bold text-manga-900 dark:text-manga-100">批量识别翻译</h2>
                            <p class="truncate text-sm text-manga-500 dark:text-manga-400">{{ state.pageLabel || '正在准备页面' }}</p>
                        </div>
                    </div>

                    <div class="mt-6 flex items-center justify-between gap-4 text-sm">
                        <span class="font-medium text-manga-700 dark:text-manga-300">
                            第 {{ state.pageIndex }} / {{ state.pageTotal }} 页
                        </span>
                        <span class="tabular-nums text-manga-500">{{ state.progress }}%</span>
                    </div>
                    <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-manga-100 dark:bg-manga-700">
                        <div class="h-full rounded-full bg-primary transition-all duration-300"
                            :style="{ width: `${state.progress}%` }" />
                    </div>

                    <div class="mt-5 min-h-16 border-y border-manga-100 dark:border-manga-700 py-4">
                        <p class="text-sm font-medium text-manga-800 dark:text-manga-200">{{ state.message }}</p>
                        <p v-if="state.regionTotal" class="mt-1 text-xs text-manga-500 dark:text-manga-400">
                            当前区域 {{ state.regionIndex }} / {{ state.regionTotal }}
                        </p>
                    </div>

                    <div class="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                        <div>
                            <strong class="block text-lg tabular-nums text-green-600 dark:text-green-400">{{ state.completedPages }}</strong>
                            <span class="text-manga-500">已完成</span>
                        </div>
                        <div>
                            <strong class="block text-lg tabular-nums text-red-600 dark:text-red-400">{{ state.failedPages }}</strong>
                            <span class="text-manga-500">失败</span>
                        </div>
                        <div>
                            <strong class="block text-lg tabular-nums text-manga-600 dark:text-manga-300">{{ state.skippedPages }}</strong>
                            <span class="text-manga-500">已跳过</span>
                        </div>
                    </div>

                    <div class="mt-6 flex justify-end">
                        <Button v-if="isProcessing" variant="danger" :disabled="isStopping" @btn-click="emit('stop')">
                            {{ isStopping ? '正在停止' : '停止处理' }}
                        </Button>
                        <Button v-else @btn-click="emit('close')">完成</Button>
                    </div>
                </section>
            </div>
        </Transition>
    </Teleport>
</template>
