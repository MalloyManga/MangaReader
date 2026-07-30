import type { TranslationModel } from '~/types/interface'

export type ModelStatus = 'unknown' | 'checking' | 'downloaded' | 'not_downloaded' | 'downloading' | 'check_failed'
type DownloadProgress = number | {
    percent?: number
    model_id?: string
    modelId?: string
    filename?: string
    stage?: string
}

export interface TranslationModelState extends TranslationModel {
    status: ModelStatus
    progress: number
    downloadStage?: string
    lastError?: string
}

const fallbackModels: TranslationModelState[] = [
    {
        id: 'opus-mt-ja-zh',
        name: 'OPUS-MT ja-zh',
        size: '约 300 MB',
        size_bytes: 314789923,
        description: '小型日译中 NMT 模型，速度快、体积小',
        engine: 'opus-mt-ja-zh',
        adapted_types: ['manga', 'general'],
        status: 'unknown',
        progress: 0,
        downloadStage: ''
    },
    {
        id: 'sakura-1.5b',
        name: 'Sakura-1.5B-Qwen2.5',
        size: '1.2 GB',
        size_bytes: 1288490189,
        description: '轻小说/漫画向本地 GGUF 翻译模型',
        engine: 'sakura',
        adapted_types: ['manga', 'light_novel', 'galgame'],
        status: 'unknown',
        progress: 0,
        downloadStage: ''
    },
    {
        id: 'qwen3-4b-instruct-2507-q4-k-m',
        name: 'Qwen3-4B-Instruct-2507 Q4_K_M',
        size: '约 2.5 GB',
        size_bytes: 2497280736,
        description: '通用指令日译中 GGUF 模型，质量更高但下载和运行占用更大',
        engine: 'qwen3-gguf',
        adapted_types: ['manga', 'general', 'dialogue'],
        status: 'unknown',
        progress: 0,
        downloadStage: ''
    }
]

const modelStates = reactive<TranslationModelState[]>([...fallbackModels])
let modelsLoaded = false
let modelsLoadPromise: Promise<TranslationModelState[]> | null = null
const modelCheckPromises = new Map<string, Promise<TranslationModelState | undefined>>()

const ensureModel = (model: TranslationModel) => {
    let existing = modelStates.find(item => item.id === model.id)
    if (!existing) {
        existing = reactive({
            ...model,
            status: 'unknown' as ModelStatus,
            progress: 0,
            downloadStage: ''
        }) as TranslationModelState
        modelStates.push(existing)
    } else {
        existing.name = model.name
        existing.size = model.size
        existing.size_bytes = model.size_bytes
        existing.description = model.description
        existing.engine = model.engine
        existing.adapted_types = model.adapted_types
    }
    return existing
}

const getModel = (modelId?: string) => {
    return modelStates.find(item => item.id === modelId) || modelStates[0]
}

export function useModelStatus() {
    const { settings } = useSettings()

    const selectedModel = computed(() => getModel(settings.value.translationModelId))

    const setSelectedModel = (modelId: string) => {
        settings.value.translationModelId = modelId
    }

    const loadTranslationModels = async (force = false) => {
        if (modelsLoaded && !force) return modelStates
        if (modelsLoadPromise && !force) return modelsLoadPromise
        if (!window.electronAPI?.listTranslationModels) {
            return modelStates
        }

        modelsLoadPromise = (async () => {
            const res = await window.electronAPI.listTranslationModels()
            const models = res.models ?? []
            if (!res.success) throw new Error(res.error || '翻译模型列表加载失败')
            if (models.length > 0) {
                models.forEach(ensureModel)

                if (!settings.value.translationModelId) {
                    const defaultModelId = res.defaultModelId || models[0]?.id
                    if (defaultModelId) settings.value.translationModelId = defaultModelId
                }
            }
            modelsLoaded = true
            return modelStates
        })()

        try {
            return await modelsLoadPromise
        } finally {
            modelsLoadPromise = null
        }
    }

    const checkModelStatus = async (modelId?: string, force = false) => {
        const target = getModel(modelId || settings.value.translationModelId)
        if (!target) return
        if (!force && !['unknown', 'checking'].includes(target.status)) return target
        if (modelCheckPromises.has(target.id)) return modelCheckPromises.get(target.id)

        const checkPromise = (async () => {
            target.status = 'checking'
            target.lastError = ''
            try {
                const res = await window.electronAPI.checkModel(target.id)
                if (!res.success) {
                    target.status = 'check_failed'
                    target.lastError = res.error || '翻译模型检查失败'
                } else if (res.exists) {
                    target.status = 'downloaded'
                    target.progress = 100
                    target.downloadStage = ''
                } else {
                    target.status = 'not_downloaded'
                    target.progress = 0
                    target.downloadStage = ''
                }
            } catch (error) {
                console.error('Model check failed:', error)
                target.status = 'check_failed'
                target.lastError = error instanceof Error ? error.message : String(error)
            } finally {
                modelCheckPromises.delete(target.id)
            }
            return target
        })()
        modelCheckPromises.set(target.id, checkPromise)
        return checkPromise
    }

    const checkAllModelStatus = async () => {
        try {
            await loadTranslationModels()
        } catch (error) {
            console.error('Translation model catalog check failed:', error)
        }
        for (const model of modelStates) {
            await checkModelStatus(model.id)
        }
    }

    const markModelDownloaded = (modelId: string) => {
        const target = getModel(modelId)
        if (!target) return
        target.status = 'downloaded'
        target.progress = 100
        target.downloadStage = ''
        target.lastError = ''
    }

    const markModelNotDownloaded = (modelId: string) => {
        const target = getModel(modelId)
        if (!target) return
        target.status = 'not_downloaded'
        target.progress = 0
        target.downloadStage = ''
        target.lastError = ''
    }

    const updateDownloadingProgress = (data: DownloadProgress) => {
        const percentValue = typeof data === 'number' ? data : data.percent
        if (typeof percentValue !== 'number') return

        const modelId = typeof data === 'number' ? undefined : (data.model_id || data.modelId)
        const target = modelId
            ? modelStates.find(item => item.id === modelId)
            : modelStates.find(item => item.status === 'downloading')
        if (!target) return

        target.progress = Math.max(target.progress, Math.max(0, Math.min(100, percentValue)))
        target.downloadStage = typeof data === 'number' ? '' : (data.stage || '')
        target.lastError = ''
        if (target.status !== 'downloading' && target.progress < 100) {
            target.status = 'downloading'
        }
    }

    return {
        models: modelStates,
        model: selectedModel,
        selectedModel,
        setSelectedModel,
        loadTranslationModels,
        checkModelStatus,
        checkAllModelStatus,
        markModelDownloaded,
        markModelNotDownloaded,
        updateDownloadingProgress
    }
}
