<!-- components/BubbleList.vue -->
<script setup lang="ts">
import type { OcrBlock } from '~/types/interface'

defineProps<{
    blocks: OcrBlock[]
    activeId?: string
}>()

const emit = defineEmits<{
    updateBlock: [block: OcrBlock]
    deleteBlock: [id: string]
    selectBlock: [id: string]
}>()

const updateText = (block: OcrBlock, val: string) => {
    emit('updateBlock', { ...block, original: val })
}
</script>

<template>
    <div class="h-full flex flex-col bg-white dark:bg-manga-800 border-l border-manga-200 dark:border-manga-700">
        <div
            class="p-4 border-b border-manga-200 dark:border-manga-700 flex justify-between items-center bg-gray-50 dark:bg-manga-900">
            <h3 class="font-bold text-gray-700 dark:text-gray-200">
                💬 气泡列表 ({{ blocks.length }})
            </h3>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div v-for="(block, index) in blocks" :key="block.id"
                class="bg-gray-50 dark:bg-manga-900 rounded-lg p-2 border-2 transition-all group flex items-center gap-3"
                :class="activeId === block.id ? 'border-primary' : 'border-transparent hover:border-gray-200 dark:hover:border-gray-600'"
                @click="emit('selectBlock', block.id)">

                <!-- 序号 -->
                <span
                    class="shrink-0 flex items-center justify-center size-6 rounded-full bg-manga-200 dark:bg-manga-800 text-xs font-bold text-gray-600 dark:text-gray-300">
                    {{ index + 1 }}
                </span>

                <!-- 可编辑区域 (使用 input) -->
                <input type="text" :value="block.original"
                    @input="event => updateText(block, (event.target as HTMLInputElement).value)"
                    class="flex-1 min-w-0 bg-white dark:bg-manga-800 rounded border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none text-gray-800 dark:text-gray-200"
                    placeholder="等待识别..." />

                <!-- 删除按钮 (hover 显示) -->
                <button @click.stop="emit('deleteBlock', block.id)"
                    class="shrink-0 text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <IconTresh class="size-4" />
                </button>
            </div>

            <div v-if="blocks.length === 0" class="text-center py-10 text-gray-400">
                <p>暂无识别内容</p>
                <p class="text-sm mt-2">
                    框选气泡开始识别
                </p>
            </div>
        </div>
    </div>
</template>
