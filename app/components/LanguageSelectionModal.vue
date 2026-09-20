<!-- components/LanguageSelectionModal.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
    isOpen: boolean
}>()

const emit = defineEmits<{
    select: [language: 'zh' | 'en']
    dismiss: []
}>()

const { t, locale } = useI18n()

const selectLanguage = (language: 'zh' | 'en') => {
    locale.value = language
    emit('select', language)
}

// 关闭不算做出选择：不写入 targetLanguage，下次启动仍会弹出
const close = () => emit('dismiss')
</script>

<template>
    <Teleport to="body">
        <Transition enter-active-class="transition ease-out duration-200"
            enter-from-class="opacity-0" enter-to-class="opacity-100"
            leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div v-if="isOpen" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" @click.self="close">
                <div class="bg-white dark:bg-manga-800 rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
                    <div class="flex justify-end -mt-4 -mr-4 mb-2">
                        <button type="button" class="size-8 flex items-center justify-center rounded-full text-manga-400 hover:bg-manga-100 hover:text-manga-700 dark:hover:bg-manga-700 dark:hover:text-manga-200" :title="t('common.close')" @click="close">
                            <IconClose class="size-4" />
                        </button>
                    </div>
                    <h2 class="text-2xl font-bold text-center mb-2 text-manga-900 dark:text-white">
                        {{ t('library.selectLanguage') }}
                    </h2>
                    <p class="text-center text-manga-500 dark:text-manga-400 mb-8">
                        {{ t('library.selectLanguageDesc') }}
                    </p>

                    <div class="space-y-4">
                        <!-- Chinese Option -->
                        <button @click="selectLanguage('zh')"
                            :class="locale === 'zh' ? 'border-primary bg-primary/5' : 'border-manga-200 dark:border-manga-600'"
                            class="w-full px-6 py-4 rounded-lg border-2 hover:border-primary dark:hover:border-blue-400 transition-colors text-left group">
                            <div class="font-bold text-lg text-manga-900 dark:text-white group-hover:text-primary dark:group-hover:text-blue-400">
                                {{ t('settings.languageZh') }}
                            </div>
                            <div class="text-sm text-manga-500 dark:text-manga-400 mt-1">
                                {{ t('library.chineseOption') }}
                            </div>
                        </button>

                        <!-- English Option -->
                        <button @click="selectLanguage('en')"
                            :class="locale === 'en' ? 'border-primary bg-primary/5' : 'border-manga-200 dark:border-manga-600'"
                            class="w-full px-6 py-4 rounded-lg border-2 hover:border-primary dark:hover:border-blue-400 transition-colors text-left group">
                            <div class="font-bold text-lg text-manga-900 dark:text-white group-hover:text-primary dark:group-hover:text-blue-400">
                                {{ t('settings.languageEn') }}
                            </div>
                            <div class="text-sm text-manga-500 dark:text-manga-400 mt-1">
                                {{ t('library.englishOption') }}
                            </div>
                        </button>
                    </div>

                    <p class="text-xs text-center text-manga-400 dark:text-manga-500 mt-6">
                        {{ t('library.languageChangeHint') }}
                    </p>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}
</style>
