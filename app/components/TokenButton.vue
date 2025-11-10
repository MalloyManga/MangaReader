<!-- app/components/TokenButton.vue -->
<script setup lang="ts">
type TokenType = 'noun' | 'verb' | 'particle' | 'adjective' | 'other'

const { word, type = 'other' } = defineProps<{
    word: string
    type?: TokenType
}>()

const emit = defineEmits<{
    click: [word: string, type: TokenType]
}>()

const getTokenColor = (tokenType: TokenType) => {
    switch (tokenType) {
        case 'noun':
            return { bg: 'var(--color-manga-400)', color: 'white' }
        case 'verb':
            return { bg: 'var(--color-accent-primary)', color: 'white' }
        case 'particle':
            return { bg: 'var(--color-manga-500)', color: 'white' }
        case 'adjective':
            return { bg: 'var(--color-accent-success)', color: 'white' }
        default:
            return { bg: 'var(--color-manga-400)', color: 'white' }
    }
}

const handleClick = () => {
    emit('click', word, type)
}
</script>

<template>
    <button class="px-3 py-1.5 rounded text-sm font-medium transition-all hover:scale-105 cursor-pointer text-ja"
        :style="{
            backgroundColor: getTokenColor(type).bg,
            color: getTokenColor(type).color
        }" @click="handleClick">
        {{ word }}
    </button>
</template>

<style scoped>
/* 组件特定样式 */
</style>
