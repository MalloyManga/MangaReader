import { useI18n } from 'vue-i18n'

const dictionaryState = reactive({
    id: 'sudachi-core',
    name: 'SudachiDict-core',
    size: '',
    description: '',
    status: 'unknown',
    progress: 0
})

export function useDictionaryStatus() {
    const { t } = useI18n()

    // 静态元信息随当前语言刷新
    dictionaryState.size = t('general.dictionarySize')
    dictionaryState.description = t('general.dictionaryDescription')

    const checkDictionaryStatus = async (force = false) => {
        if (dictionaryState.status === 'unknown' || force) {
            dictionaryState.status = 'checking'
        }

        try {
            const res = await window.electronAPI.checkDictionary()

            if (res.success && res.exists) {
                dictionaryState.status = 'downloaded'
                dictionaryState.progress = 100
            } else {
                dictionaryState.status = 'not_downloaded'
                dictionaryState.progress = 0
            }
        } catch (e) {
            console.error("Dictionary check failed:", e)
            dictionaryState.status = 'not_downloaded'
        }
    }

    return {
        dictionary: dictionaryState,
        checkDictionaryStatus
    }
}
