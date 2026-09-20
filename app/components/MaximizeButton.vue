<!-- Comp/MaximizeButton.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
    isMaximized: boolean
}
defineProps<Props>()

const emit = defineEmits<{
    maximizeBtnClick: []
}>()
</script>

<template>
    <button @click="emit('maximizeBtnClick')" :aria-label="isMaximized ? t('common.restore') : t('common.maximize')"
        :title="isMaximized ? t('common.restore') : t('common.maximize')"
        class="w-12 h-full flex items-center justify-center hover:bg-manga-200 dark:hover:bg-manga-700 transition-colors group">
        <!-- 使用 v-if / v-else 切换图标 -->
        <IconRestore v-if="isMaximized"
            class="size-4 text-manga-600 dark:text-manga-400 group-hover:text-manga-900 dark:group-hover:text-white" />
        <IconMaximize v-else
            class="size-4 text-manga-600 dark:text-manga-400 group-hover:text-manga-900 dark:group-hover:text-white" />
    </button>
</template>
