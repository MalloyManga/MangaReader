import { i18n } from '~/locales/instance'

export default defineNuxtPlugin(({ vueApp }) => {
  vueApp.use(i18n)
})
