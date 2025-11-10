<!-- app/components/OriginalText.vue -->
<script setup lang="ts">
const { text } = defineProps<{
    text: string
}>()

const emit = defineEmits<{
    update: [text: string]
}>()

const localText = ref(text)

watch(() => text, (newVal) => {
    localText.value = newVal
})

const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement
    emit('update', target.value)
}
</script>

<template>
    <div class="card-manga p-4">
        <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-semibold" style="color: var(--text-secondary)">
                📝 识别原文
            </div>
            <CopyButton :text="localText" />
        </div>

        <textarea v-model="localText" @input="handleInput" class="input-manga w-full text-ja resize-none" rows="3"
            placeholder="OCR 识别结果将显示在这里..." style="color: var(--text-primary)" />
    </div>
</template>

<style scoped>
textarea {
    line-height: 1.8;
}
</style>
