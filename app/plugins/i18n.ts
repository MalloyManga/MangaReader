import { createI18n } from 'vue-i18n'
import zh from '~/locales/zh.json'
import en from '~/locales/en.json'
import type { I18n } from 'vue-i18n'

export default defineNuxtPlugin(({ vueApp }) => {
  const i18n: I18n = createI18n({
    legacy: false,
    locale: 'zh',
    fallbackLocale: 'zh',
    messages: {
      zh,
      en
    }
  })

  vueApp.use(i18n)
})
