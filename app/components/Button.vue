<!-- app/components/Button.vue -->
<script setup lang="ts">
interface Prop {
    variant?: 'primary' | 'secondary' | 'outline' | 'danger'
    size?: 'sm' | 'md' | 'lg'
}
const { variant = 'primary', size = 'md' } = defineProps<Prop>()

const getButtonClass = computed(() => {
    const variantClass = {
        primary: 'px-4 py-2 bg-primary text-white rounded-primary hover:opacity-90 hover:-translate-y-px hover:shadow-base',
        secondary: 'px-3 py-1.5 bg-manga-400 text-white rounded-secondary hover:opacity-90 hover:-translate-y-px hover:shadow-base',
        outline: 'px-4 py-2 font-medium text-manga-600 dark:text-manga-300 bg-white dark:bg-manga-800 border border-manga-300 dark:border-manga-600 rounded-lg hover:bg-manga-50 dark:hover:bg-manga-700 focus:outline-none',
        danger: 'px-4 py-2 font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 rounded-lg shadow-sm focus:outline-none transition-all flex items-center gap-2'
    }[variant]

    const sizeClass = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg'
    }[size]

    return `${variantClass} ${sizeClass}`
})

const emit = defineEmits<{
    btnClick: []
}>()
</script>

<template>
    <button @click="emit('btnClick')" class="rounded transition-all duration-200 cursor-pointer"
        :class="getButtonClass">
        <slot />
    </button>
</template>
