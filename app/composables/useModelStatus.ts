import type { TranslationModel } from '~/types/interface'
import { useI18n } from 'vue-i18n'

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
        target_languages: ['zh'],
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
        target_languages: ['zh'],
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
        target_languages: ['zh'],
        status: 'unknown',
        progress: 0,
        downloadStage: ''
    }
]

const modelStates = reactive<TranslationModelState[]>([...fallbackModels])
// 记录目录当前对应哪种目标语言，语言变化时必须重新拉取
let modelsLoadedLang: string | null = null
let modelsLoadPromise: Promise<TranslationModelState[]> | null = null
const modelCheckPromises = new Map<string, Promise<TranslationModelState | undefined>>()

const modelsForLang = (lang: string) =>
    modelStates.filter(model => (model.target_languages ?? ['zh']).includes(lang))

const pickDefaultModelId = (lang: string) => {
    const available = modelsForLang(lang)
    if (!available.length) return undefined
    return available.reduce((smallest, model) =>
        (model.size_bytes ?? Infinity) < (smallest.size_bytes ?? Infinity) ? model : smallest).id
}

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
        existing.target_languages = model.target_languages
    }
    return existing
}

const getModel = (modelId?: string) => {
    return modelStates.find(item => item.id === modelId) || modelStates[0]
}

export function useModelStatus() {
    const { t } = useI18n()
    const { settings } = useSettings()

    const selectedModel = computed(() => getModel(settings.value.translationModelId))

    const setSelectedModel = (modelId: string) => {
        settings.value.translationModelId = modelId
    }

    const loadTranslationModels = async (force = false) => {
        const lang = settings.value.targetLanguage || 'zh'
        if (modelsLoadedLang === lang && !force) return modelStates
        if (modelsLoadPromise && !force) return modelsLoadPromise
        if (!window.electronAPI?.listTranslationModels) {
            return modelStates
        }

        modelsLoadPromise = (async () => {
            const res = await window.electronAPI.listTranslationModels(lang)
            const models = res.models ?? []
            if (!res.success) throw new Error(res.error || t('fileWorkflow.modelListLoadFailed'))
            if (models.length > 0) {
                models.forEach(ensureModel)
                // 目录只保留目标语言的模型，切换语言后另一种语言的模型不再出现
                const visible = new Set(models.map(model => model.id))
                for (let index = modelStates.length - 1; index >= 0; index--) {
                    if (!visible.has(modelStates[index].id)) modelStates.splice(index, 1)
                }

                // 已选模型不属于新语言时，自动切到该语言的默认（体积最小）模型
                if (!models.some(model => model.id === settings.value.translationModelId)) {
                    settings.value.translationModelId = res.defaultModelId || pickDefaultModelId(lang)
                }
                modelsLoadedLang = lang
            }
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
                    target.lastError = res.error || t('translationManagement.checkFailed')
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
