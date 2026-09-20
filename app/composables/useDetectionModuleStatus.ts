import { useI18n } from 'vue-i18n'

export type DetectionModuleStatus = 'checking' | 'not_installed' | 'downloading' | 'installed' | 'corrupted' | 'unavailable' | 'error'

export interface DetectionModuleState {
    id: string
    name: string
    description: string
    downloadSize: string
    installedSize: string
    version: string
    status: DetectionModuleStatus
    progress: number
    stage: string
    message: string
    error: string
}

const detectionModuleState = reactive<DetectionModuleState>({
    id: 'ctd-detector',
    name: '',
    description: '',
    downloadSize: '',
    installedSize: '',
    version: '',
    status: 'checking',
    progress: 0,
    stage: '',
    message: '',
    error: ''
})

export function useDetectionModuleStatus() {
    const { t } = useI18n()

    // 静态元信息随当前语言刷新（设置面板每次打开会重新调用本 composable）
    detectionModuleState.name = t('detectionManagement.moduleName')
    detectionModuleState.description = t('detectionManagement.moduleDescription')
    detectionModuleState.downloadSize = t('detectionManagement.moduleDownloadSize')
    detectionModuleState.installedSize = t('detectionManagement.moduleInstalledSize')
    if (detectionModuleState.status === 'checking' && !detectionModuleState.message) {
        detectionModuleState.message = t('detectionManagement.checkingIntegrity')
    }

    const checkStatus = async () => {
        if (!window.electronAPI?.checkDetectionModule) {
            detectionModuleState.status = 'unavailable'
            detectionModuleState.message = t('detectionManagement.desktopManageRequired')
            return
        }

        detectionModuleState.status = 'checking'
        detectionModuleState.message = t('detectionManagement.checkingIntegrity')
        detectionModuleState.error = ''
        try {
            const result = await window.electronAPI.checkDetectionModule()
            if (!result.success) throw new Error(result.error || t('detectionManagement.statusCheckFailed'))
            if (result.installed) {
                detectionModuleState.status = 'installed'
                detectionModuleState.progress = 100
                detectionModuleState.version = result.version || ''
                detectionModuleState.message = t('detectionManagement.integrityPassed')
            } else if (result.corrupted) {
                detectionModuleState.status = 'corrupted'
                detectionModuleState.progress = 0
                detectionModuleState.version = ''
                detectionModuleState.message = result.message || t('detectionManagement.filesIncomplete')
            } else {
                detectionModuleState.status = 'not_installed'
                detectionModuleState.progress = 0
                detectionModuleState.version = ''
                detectionModuleState.message = t('detectionManagement.notInstalledMessage')
            }
        } catch (error) {
            detectionModuleState.status = 'error'
            detectionModuleState.error = error instanceof Error ? error.message : String(error)
            detectionModuleState.message = t('detectionManagement.readStatusFailed')
        }
    }

    const updateProgress = (progress: number | { percent?: number, stage?: string, message?: string }) => {
        const percent = typeof progress === 'number' ? progress : progress.percent
        if (typeof percent !== 'number') return
        detectionModuleState.status = 'downloading'
        detectionModuleState.progress = Math.max(0, Math.min(100, percent))
        detectionModuleState.stage = typeof progress === 'number' ? '' : (progress.stage || '')
        detectionModuleState.message = typeof progress === 'number'
            ? t('detectionManagement.downloadingModule')
            : (progress.message || t('detectionManagement.downloadingModule'))
    }

    return {
        detectionModule: detectionModuleState,
        checkStatus,
        updateProgress
    }
}
