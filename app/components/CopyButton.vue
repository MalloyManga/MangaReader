<!-- app/components/CopyButton.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
// 接收一个父级传递过来的text来实现点击按钮复制
interface Prop {
    textToCopy: string
}
const { textToCopy } = defineProps<Prop>()
const { showToast } = useToast()

const copyText = async () => {
    try {
        await window.navigator.clipboard.writeText(textToCopy)
        showToast(t('common.copied'), 1500)
    } catch (err) {
        showToast(t('common.copyFailed'), 1500)
        console.error('复制失败:', err)
    }
}
</script>

<template>
    <button class="text-xs px-2 py-1 rounded cursor-pointer transition-all hover:opacity-80 bg-manga-400 text-white"
        @click="copyText">
        {{ t('common.copy') }}
    </button>
</template>
