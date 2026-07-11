const dictionaryState = reactive({
    id: 'sudachi-core',
    name: 'SudachiDict-core',
    size: '约 207 MB',
    description: '日语分词所需词典；下载后才能显示分词结果。',
    status: 'unknown',
    progress: 0
})

export function useDictionaryStatus() {
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
