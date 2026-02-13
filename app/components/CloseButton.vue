<!-- CloseButton.vue -->
<script setup lang="ts">
const emit = defineEmits<{
    closeBtnClick: []
}>()
</script>

<template>
    <button @click="emit('closeBtnClick')"
        class="w-12 h-full flex items-center justify-center hover:bg-red-500 transition-colors group">
        <IconClose class="size-4 text-manga-600 dark:text-manga-400 group-hover:text-white" />
    </button>
</template>
