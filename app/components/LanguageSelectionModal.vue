<!-- components/LanguageSelectionModal.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
    isOpen: boolean
}>()

const emit = defineEmits<{
    select: [language: 'zh' | 'en']
}>()

const { t, locale } = useI18n()

const selectLanguage = (language: 'zh' | 'en') => {
    locale.value = language
    emit('select', language)
}
</script>

<template>
    <Teleport to="body">
        <Transition enter-active-class="transition ease-out duration-200"
            enter-from-class="opacity-0" enter-to-class="opacity-100"
            leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div v-if="isOpen" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
                <div class="bg-white dark:bg-manga-800 rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
                    <h2 class="text-2xl font-bold text-center mb-2 text-manga-900 dark:text-white">
                        {{ t('library.selectLanguage') }}
                    </h2>
                    <p class="text-center text-manga-500 dark:text-manga-400 mb-8">
                        {{ t('library.selectLanguageDesc') }}
                    </p>

                    <div class="space-y-4">
                        <!-- Chinese Option -->
                        <button @click="selectLanguage('zh')"
                            class="w-full px-6 py-4 rounded-lg border-2 border-manga-200 dark:border-manga-600 hover:border-primary dark:hover:border-blue-400 transition-colors text-left group">
                            <div class="font-bold text-lg text-manga-900 dark:text-white group-hover:text-primary dark:group-hover:text-blue-400">
                                中文
                            </div>
                            <div class="text-sm text-manga-500 dark:text-manga-400 mt-1">
                                Chinese interface with Chinese translations
                            </div>
                        </button>

                        <!-- English Option -->
                        <button @click="selectLanguage('en')"
                            class="w-full px-6 py-4 rounded-lg border-2 border-manga-200 dark:border-manga-600 hover:border-primary dark:hover:border-blue-400 transition-colors text-left group">
                            <div class="font-bold text-lg text-manga-900 dark:text-white group-hover:text-primary dark:group-hover:text-blue-400">
                                English
                            </div>
                            <div class="text-sm text-manga-500 dark:text-manga-400 mt-1">
                                English interface with English translations
                            </div>
                        </button>
                    </div>

                    <p class="text-xs text-center text-manga-400 dark:text-manga-500 mt-6">
                        You can change this anytime in Settings
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
