import { createI18n } from 'vue-i18n'
import zh from './zh.json'
import en from './en.json'
import type { I18n } from 'vue-i18n'

export type AppLocale = 'zh' | 'en'

// 只做 zh/en 二分: 非中文系统语言一律给英文 避免首启强制中文
export const resolveInitialLocale = (navLanguage?: string): AppLocale =>
  navLanguage?.toLowerCase().startsWith('zh') ? 'zh' : 'en'

export const i18n: I18n = createI18n({
  legacy: false,
  locale: typeof navigator === 'undefined' ? 'zh' : resolveInitialLocale(navigator.language),
  fallbackLocale: 'zh',
  messages: {
    zh,
    en
  }
})
