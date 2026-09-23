import { useI18n } from 'vue-i18n'

const capabilityState = reactive({
    name: '',
    size: '',
    status: 'unknown' as 'unknown' | 'checking' | 'missing' | 'installing' | 'ready',
    progress: 0,
    runtimeInstalled: false,
    dictionaryReady: false
})

// 点词能力 = 分词运行环境 (约 3.5 MB) + 日语词典 (约 207 MB)
// 对用户只暴露一次下载 运行环境只占很小一段 按字节权重折算进同一条进度
const RUNTIME_WEIGHT = 3.5 / (3.5 + 207)

export function useTokenizationCapability() {
    const { t } = useI18n()

    capabilityState.name = t('general.capabilityName')
    capabilityState.size = t('general.capabilitySize')

    const syncStatus = () => {
        capabilityState.status =
            capabilityState.runtimeInstalled && capabilityState.dictionaryReady
                ? 'ready'
                : 'missing'
    }

    const checkCapabilityStatus = async (force = false) => {
        if (capabilityState.status === 'unknown' || force) {
            capabilityState.status = 'checking'
        }

        try {
            const [runtime, dictionary] = await Promise.all([
                window.electronAPI?.checkTokenizationRuntime?.() ?? Promise.resolve({ success: false }),
                window.electronAPI?.checkDictionary?.() ?? Promise.resolve({ success: false })
            ])
            capabilityState.runtimeInstalled = Boolean(runtime.success && runtime.installed)
            capabilityState.dictionaryReady = Boolean(dictionary.success && dictionary.exists)
        } catch (e) {
            console.error('Capability check failed:', e)
            capabilityState.runtimeInstalled = false
            capabilityState.dictionaryReady = false
        }
        syncStatus()
    }

    const installCapability = async () => {
        if (capabilityState.status === 'installing') return false
        capabilityState.status = 'installing'
        capabilityState.progress = 0

        try {
            if (!capabilityState.runtimeInstalled) {
                const res = await window.electronAPI.downloadTokenizationRuntime()
                if (!res?.success) throw new Error(res?.error || 'RUNTIME_DOWNLOAD_FAILED')
                capabilityState.runtimeInstalled = true
            }
            capabilityState.progress = RUNTIME_WEIGHT * 100

            if (!capabilityState.dictionaryReady) {
                const res = await window.electronAPI.downloadDictionary()
                if (!res?.success) throw new Error(res?.error || 'DICTIONARY_DOWNLOAD_FAILED')
                capabilityState.dictionaryReady = true
            }

            capabilityState.progress = 100
            capabilityState.status = 'ready'
            return true
        } catch (e) {
            console.error('Capability install failed:', e)
            await checkCapabilityStatus(true)
            return false
        }
    }

    // 运行环境留着不影响体积目标 删除时两块一起收回
    const deleteCapability = async () => {
        try {
            await window.electronAPI.deleteDictionary()
            await window.electronAPI.deleteTokenizationRuntime()
        } catch (e) {
            console.error('Capability delete failed:', e)
            return false
        }
        capabilityState.runtimeInstalled = false
        capabilityState.dictionaryReady = false
        capabilityState.progress = 0
        capabilityState.status = 'missing'
        return true
    }

    // 两段下载各自回进度 合成一条
    const applyRuntimeProgress = (percent: number) => {
        if (capabilityState.status !== 'installing') return
        capabilityState.progress = Math.min(percent, 100) * RUNTIME_WEIGHT
    }

    const applyDictionaryProgress = (percent: number) => {
        if (capabilityState.status !== 'installing') return
        capabilityState.progress = RUNTIME_WEIGHT * 100 + Math.min(percent, 100) * (1 - RUNTIME_WEIGHT)
    }

    return {
        capability: capabilityState,
        checkCapabilityStatus,
        installCapability,
        deleteCapability,
        applyRuntimeProgress,
        applyDictionaryProgress
    }
}
