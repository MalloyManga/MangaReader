<!-- CloseButton.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits<{
    closeBtnClick: []
}>()
</script>

<template>
    <button @click="emit('closeBtnClick')" :aria-label="t('common.close')" :title="t('common.close')"
        class="w-12 h-full flex items-center justify-center hover:bg-red-500 transition-colors group">
        <IconClose class="size-4 text-manga-600 dark:text-manga-400 group-hover:text-white" />
    </button>
</template>
