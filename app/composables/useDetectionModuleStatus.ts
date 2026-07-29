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
    name: '漫画文字自动检测',
    description: '自动定位漫画页面中的文字区域，复用现有 OCR 与翻译模型。',
    downloadSize: '约 121 MB',
    installedSize: '约 180–220 MB',
    version: '',
    status: 'checking',
    progress: 0,
    stage: '',
    message: '正在检查模块完整性',
    error: ''
})

export function useDetectionModuleStatus() {
    const checkStatus = async () => {
        if (!window.electronAPI?.checkDetectionModule) {
            detectionModuleState.status = 'unavailable'
            detectionModuleState.message = '检测模块需要在桌面应用中管理'
            return
        }

        detectionModuleState.status = 'checking'
        detectionModuleState.message = '正在检查模块完整性'
        detectionModuleState.error = ''
        try {
            const result = await window.electronAPI.checkDetectionModule()
            if (!result.success) throw new Error(result.error || '检测模块状态检查失败')
            if (result.installed) {
                detectionModuleState.status = 'installed'
                detectionModuleState.progress = 100
                detectionModuleState.version = result.version || ''
                detectionModuleState.message = '所有文件已通过完整性校验'
            } else if (result.corrupted) {
                detectionModuleState.status = 'corrupted'
                detectionModuleState.progress = 0
                detectionModuleState.version = ''
                detectionModuleState.message = result.message || '模块文件不完整，需要重新下载'
            } else {
                detectionModuleState.status = 'not_installed'
                detectionModuleState.progress = 0
                detectionModuleState.version = ''
                detectionModuleState.message = '模块尚未安装'
            }
        } catch (error) {
            detectionModuleState.status = 'error'
            detectionModuleState.error = error instanceof Error ? error.message : String(error)
            detectionModuleState.message = '无法读取模块状态'
        }
    }

    const updateProgress = (progress: number | { percent?: number, stage?: string, message?: string }) => {
        const percent = typeof progress === 'number' ? progress : progress.percent
        if (typeof percent !== 'number') return
        detectionModuleState.status = 'downloading'
        detectionModuleState.progress = Math.max(0, Math.min(100, percent))
        detectionModuleState.stage = typeof progress === 'number' ? '' : (progress.stage || '')
        detectionModuleState.message = typeof progress === 'number'
            ? '正在下载检测模块'
            : (progress.message || '正在下载检测模块')
    }

    return {
        detectionModule: detectionModuleState,
        checkStatus,
        updateProgress
    }
}
