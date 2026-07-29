export type DetectionModuleStatus = 'checking' | 'not_installed' | 'downloading' | 'installed' | 'unavailable' | 'error'

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
    error: string
}

const detectionModuleState = reactive<DetectionModuleState>({
    id: 'ctd-detector',
    name: '漫画文字自动检测',
    description: '自动定位漫画页面中的文字区域，并复用现有 OCR 与翻译模型。',
    downloadSize: '约 77–80 MB',
    installedSize: '约 80–90 MB',
    version: '',
    status: 'checking',
    progress: 0,
    stage: '',
    error: ''
})

export function useDetectionModuleStatus() {
    const checkStatus = async () => {
        if (!window.electronAPI?.checkDetectionModule) {
            detectionModuleState.status = 'unavailable'
            detectionModuleState.error = '检测模块后端接口将在下一阶段接入'
            return
        }

        detectionModuleState.status = 'checking'
        detectionModuleState.error = ''
        try {
            const result = await window.electronAPI.checkDetectionModule()
            if (result.success && result.installed) {
                detectionModuleState.status = 'installed'
                detectionModuleState.progress = 100
                detectionModuleState.version = result.version || ''
            } else {
                detectionModuleState.status = 'not_installed'
                detectionModuleState.progress = 0
                detectionModuleState.version = ''
            }
        } catch (error) {
            detectionModuleState.status = 'error'
            detectionModuleState.error = error instanceof Error ? error.message : String(error)
        }
    }

    const updateProgress = (progress: number | { percent?: number, stage?: string }) => {
        const percent = typeof progress === 'number' ? progress : progress.percent
        if (typeof percent !== 'number') return
        detectionModuleState.status = 'downloading'
        detectionModuleState.progress = Math.max(0, Math.min(100, percent))
        detectionModuleState.stage = typeof progress === 'number' ? '' : (progress.stage || '')
    }

    return {
        detectionModule: detectionModuleState,
        checkStatus,
        updateProgress
    }
}
