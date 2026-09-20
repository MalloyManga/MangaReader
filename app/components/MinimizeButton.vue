<!-- Comp/MinimizeButton.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits<{
    minimizeBtnClick: []
}>()
</script>

<template>
    <button @click="emit('minimizeBtnClick')" :aria-label="t('common.minimize')" :title="t('common.minimize')"
        class="w-12 h-full pb-2 flex items-center justify-center hover:bg-manga-200 dark:hover:bg-manga-700 transition-colors group">
        <IconMinimize
            class="size-4 text-manga-600 dark:text-manga-400 group-hover:text-manga-900 dark:group-hover:text-white" />
    </button>
</template>
