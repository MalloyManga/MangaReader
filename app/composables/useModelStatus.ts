import type { TranslationModel } from '~/types/interface'

type ModelStatus = 'unknown' | 'checking' | 'downloaded' | 'not_downloaded' | 'downloading'

export interface TranslationModelState extends TranslationModel {
    status: ModelStatus
    progress: number
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
        progress: 0
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
        progress: 0
    }
]

const modelStates = reactive<TranslationModelState[]>([...fallbackModels])

const ensureModel = (model: TranslationModel) => {
    let existing = modelStates.find(item => item.id === model.id)
    if (!existing) {
        existing = reactive({
            ...model,
            status: 'unknown' as ModelStatus,
            progress: 0
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

    const loadTranslationModels = async () => {
        if (!window.electronAPI?.listTranslationModels) {
            return modelStates
        }

        const res = await window.electronAPI.listTranslationModels()
        if (res.success && res.models?.length) {
            res.models.forEach(ensureModel)

            if (!settings.value.translationModelId) {
                settings.value.translationModelId = res.defaultModelId || res.models[0].id
            }
        }

        return modelStates
    }

    const checkModelStatus = async (modelId?: string, force = false) => {
        const target = getModel(modelId || settings.value.translationModelId)
        if (!target) return

        if (target.status === 'unknown' || force) {
            target.status = 'checking'
        }

        try {
            const res = await window.electronAPI.checkModel(target.id)

            if (res.success && res.exists) {
                target.status = 'downloaded'
                target.progress = 100
            } else {
                target.status = 'not_downloaded'
                target.progress = 0
            }
        } catch (e) {
            console.error("Model check failed:", e)
            target.status = 'not_downloaded'
        }
    }

    const checkAllModelStatus = async () => {
        await loadTranslationModels()
        for (const model of modelStates) {
            await checkModelStatus(model.id)
        }
    }

    const updateDownloadingProgress = (percent: number) => {
        const target = modelStates.find(item => item.status === 'downloading')
        if (!target) return

        target.progress = percent
        if (percent >= 100) {
            target.status = 'downloaded'
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
        updateDownloadingProgress
    }
}
