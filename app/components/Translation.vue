<!-- app/components/Translation.vue -->
<script setup lang="ts">
const { originalText, translatedText, isLoading } = defineProps<{
    originalText: string
    translatedText: string
    isLoading?: boolean
}>()

const emit = defineEmits<{
    translate: []
}>()

const showTranslation = ref(false)

const toggleTranslation = () => {
    if (!showTranslation.value && !translatedText) {
        emit('translate')
    }
    showTranslation.value = !showTranslation.value
}
</script>

<template>
    <div class="card-manga p-4">
        <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-semibold" style="color: var(--text-secondary)">
                🌐 翻译
            </div>
            <CopyButton v-if="showTranslation && translatedText" :text="translatedText" />
        </div>

        <!-- 翻译内容 -->
        <transition name="fade">
            <div v-if="showTranslation">
                <div v-if="isLoading" class="flex items-center gap-2" style="color: var(--text-secondary)">
                    <div class="animate-spin h-4 w-4 border-2 rounded-full" style="
              border-color: var(--color-accent-primary);
              border-top-color: transparent;
            "></div>
                    <span class="text-sm">翻译中...</span>
                </div>

                <p v-else-if="translatedText" class="text-sm leading-relaxed" style="color: var(--text-primary)">
                    {{ translatedText }}
                </p>

                <p v-else class="text-sm" style="color: var(--text-secondary)">
                    暂无翻译
                </p>
            </div>
        </transition>

        <!-- 操作按钮 -->
        <div class="mt-3 flex gap-2">
            <Button size="sm" @click="toggleTranslation">
                {{ showTranslation ? "隐藏" : "显示" }}翻译
            </Button>

            <Button v-if="!translatedText" variant="secondary" size="sm" @click="emit('translate')">
                重新翻译
            </Button>
        </div>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
