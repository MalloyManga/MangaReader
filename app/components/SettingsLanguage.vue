<!-- components/SettingsLanguage.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n()
const { settings } = useSettings()
const { loadTranslationModels } = useModelStatus()

// 语言名一律用自称，两种界面语言下都显示「中文 / English」
const languages = [
  { code: 'zh', nameKey: 'settings.languageZh' },
  { code: 'en', nameKey: 'settings.languageEn' }
]

const changeLanguage = async (code: 'zh' | 'en') => {
  locale.value = code
  settings.value.targetLanguage = code
  await loadTranslationModels()
}

onMounted(() => {
  // 初始化 i18n 语言为设置中的语言
  if (settings.value.targetLanguage) {
    locale.value = settings.value.targetLanguage
  }
})
</script>

<template>
  <div class="p-6">
    <h3 class="text-lg font-semibold text-manga-900 dark:text-white mb-6">
      {{ t('settings.language') }}
    </h3>

    <div class="space-y-3">
      <div v-for="lang in languages" :key="lang.code" class="flex items-center">
        <input
          :id="`lang-${lang.code}`"
          type="radio"
          :name="'language'"
          :value="lang.code"
          :checked="settings.targetLanguage === lang.code"
          @change="changeLanguage(lang.code as 'zh' | 'en')"
          class="w-4 h-4 cursor-pointer"
        />
        <label :for="`lang-${lang.code}`" class="ml-3 cursor-pointer flex-1 font-medium text-manga-900 dark:text-white">
          {{ t(lang.nameKey) }}
        </label>
      </div>
    </div>

    <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
      <p class="text-sm text-blue-800 dark:text-blue-200">
        {{ t('settings.languageHint') }}
      </p>
    </div>
  </div>
</template>
