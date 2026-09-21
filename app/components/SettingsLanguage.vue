<!-- components/SettingsLanguage.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n()
const { settings } = useSettings()
const { loadTranslationModels } = useModelStatus()
const { showToast } = useToast()

// 语言名一律用自称 两种界面语言下都显示"中文 / English"
const languages = [
  { code: 'zh', nameKey: 'settings.languageZh' },
  { code: 'en', nameKey: 'settings.languageEn' }
]

const changeLanguage = async (code: 'zh' | 'en') => {
  locale.value = code
  settings.value.targetLanguage = code
  await loadTranslationModels()
  showToast(t(code === 'zh' ? 'messages.languageChanged' : 'messages.languageChangedEn'), 2000)
}

onMounted(() => {
  // 初始化 i18n 语言为设置中的语言
  if (settings.value.targetLanguage) {
    locale.value = settings.value.targetLanguage
  }
})
</script>

<template>
  <div class="space-y-6 animate-fade-in">
    <div>
      <h3 class="text-lg font-bold text-manga-900 dark:text-white">
        {{ t('settings.language') }}
      </h3>
      <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">
        {{ t('settings.languageDesc') }}
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3" role="radiogroup" :aria-label="t('settings.language')">
      <button v-for="lang in languages" :key="lang.code" type="button" role="radio"
        :aria-checked="settings.targetLanguage === lang.code"
        @click="changeLanguage(lang.code as 'zh' | 'en')"
        class="relative flex flex-col items-center justify-center gap-3 py-7 rounded-xl border transition-all cursor-pointer"
        :class="settings.targetLanguage === lang.code
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-1 ring-blue-200 dark:ring-blue-800 shadow-sm'
          : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 hover:bg-manga-50 dark:hover:bg-manga-800 hover:border-manga-300 dark:hover:border-manga-500'">

        <div v-if="settings.targetLanguage === lang.code"
          class="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-sm">
          <IconCheckMark class="size-3" />
        </div>

        <div class="p-3 rounded-xl transition-colors"
          :class="settings.targetLanguage === lang.code
            ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200'
            : 'bg-manga-100 dark:bg-manga-800 text-manga-500 dark:text-manga-400'">
          <IconLanguage class="size-8" />
        </div>

        <span class="font-bold text-base"
          :class="settings.targetLanguage === lang.code
            ? 'text-blue-700 dark:text-blue-300'
            : 'text-manga-900 dark:text-gray-200'">
          {{ t(lang.nameKey) }}
        </span>
      </button>
    </div>

    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800/50">
      <div class="flex items-start gap-3">
        <div class="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0">
          <IconTip class="size-5" />
        </div>
        <p class="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
          {{ t('settings.languageHint') }}
        </p>
      </div>
    </div>
  </div>
</template>
