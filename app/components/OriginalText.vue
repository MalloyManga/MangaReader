<!-- app/components/OriginalText.vue -->
<script setup lang="ts">
interface Props {
    isRecognizing: boolean
}
const { isRecognizing } = defineProps<Props>()

const localText = defineModel('localText', { type: String })
</script>

<template>
    <div class="card">
        <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-semibold text-manga-600 dark:text-manga-200">
                {{ isRecognizing ? '😎 正在识别' : '📝 识别原文' }}
            </div>
            <CopyButton :textToCopy="localText ?? ''" />
        </div>

        <textarea v-model="localText"
            class="bg-manga-50 dark:bg-manga-700 rounded-primary py-2 px-3 text-manga-500 dark:text-manga-50 transition-all duration-200 border border-manga-200 dark:border-manga-500 w-full font-ja leading-[1.8] resize-none outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(91,141,190,0.1)]"
            rows="3" placeholder="OCR 识别结果将显示在这里..." />
    </div>
</template>
