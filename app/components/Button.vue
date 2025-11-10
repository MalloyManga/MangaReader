<!-- app/components/Button.vue -->
<script setup lang="ts">
const { variant = 'primary', size = 'md' } = defineProps<{
    variant?: 'primary' | 'secondary'
    size?: 'sm' | 'md' | 'lg'
}>()

const getButtonClass = () => {
    const baseClass = 'rounded transition-all cursor-pointer'

    const variantClass = variant === 'primary'
        ? 'btn-manga'
        : 'px-3 py-1.5 rounded'

    const sizeClass = size === 'sm'
        ? 'text-sm'
        : size === 'lg'
            ? 'text-lg'
            : 'text-base'

    return `${baseClass} ${variantClass} ${sizeClass}`
}

const getButtonStyle = () => {
    if (variant === 'secondary') {
        return {
            backgroundColor: 'var(--color-manga-400)',
            color: 'white'
        }
    }
    return {}
}
</script>

<template>
    <button :class="getButtonClass()" :style="getButtonStyle()">
        <slot />
    </button>
</template>

<style scoped>
/* 组件特定样式 */
</style>
