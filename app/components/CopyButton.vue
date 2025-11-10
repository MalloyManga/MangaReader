<!-- app/components/CopyButton.vue -->
<script setup lang="ts">
const { text } = defineProps<{
    text: string
}>()

const copyText = async () => {
    try {
        await window.navigator.clipboard.writeText(text)
    } catch (err) {
        console.error('复制失败:', err)
    }
}
</script>

<template>
    <button class="text-xs px-2 py-1 rounded cursor-pointer transition-all hover:opacity-80"
        style="background-color: var(--color-manga-400); color: white;" @click="copyText">
        复制
    </button>
</template>

<style scoped>
/* 组件特定样式 */
</style>
