import { createI18n } from 'vue-i18n'
import zh from './zh.json'
import en from './en.json'
import type { I18n } from 'vue-i18n'

export const i18n: I18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages: {
    zh,
    en
  }
})
