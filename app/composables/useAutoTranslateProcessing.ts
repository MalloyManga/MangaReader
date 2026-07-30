import type { Ref } from 'vue'
import type { DetectedTextRegion, OcrBlock } from '~/types/interface'

export type AutoTranslateStage = 'idle' | 'detecting' | 'recognizing' | 'translating' | 'complete' | 'error'

export interface AutoTranslatePageState {
    stage: AutoTranslateStage
    progress: number
    message: string
}

interface AutoTranslateProcessingOptions {
    currentImageId: Ref<string | undefined>
    ocrBlocks: Ref<OcrBlock[]>
    activeBlockId: Ref<string | undefined>
}

interface SelectionData {
    left: number
    top: number
    width: number
    height: number
}

const createIdleState = (): AutoTranslatePageState => ({
    stage: 'idle',
    progress: 0,
    message: '等待开始处理'
})

export function useAutoTranslateProcessing(options: AutoTranslateProcessingOptions) {
    const { currentImageId, ocrBlocks, activeBlockId } = options
    const { settings } = useSettings()
    const { showToast } = useToast()
    const { selectedModel, loadTranslationModels, checkModelStatus } = useModelStatus()
    const pageStates = ref<Record<string, AutoTranslatePageState>>({})
    const isProcessing = ref(false)
    const isOcrMode = ref(false)
    const isOcrRecognizing = ref(false)
    const translationReady = ref(false)
    const translationMessage = ref('正在检查翻译模型')

    const detectorAvailable = computed(() => import.meta.client && Boolean(window.electronAPI?.detectTextRegions))
    const currentState = computed<AutoTranslatePageState>(() => {
        const imageId = currentImageId.value
        return imageId ? (pageStates.value[imageId] || createIdleState()) : createIdleState()
    })

    const log = (...args: unknown[]) => console.log('[AutoTranslate]', ...args)

    const checkTranslationReady = async () => {
        translationReady.value = false
        log('checking translation model configuration')
        if (!settings.value.enableTranslation) {
            translationMessage.value = '请先在设置中启用翻译'
            console.warn('[AutoTranslate] translation is disabled')
            return false
        }
        if (!window.electronAPI?.listTranslationModels || !window.electronAPI?.checkModel) {
            translationMessage.value = '当前环境无法检查翻译模型'
            console.error('[AutoTranslate] translation model API is unavailable')
            return false
        }
        try {
            await loadTranslationModels()
            const modelId = settings.value.translationModelId
            if (!modelId) {
                translationMessage.value = '请先在设置中选择翻译模型'
                console.warn('[AutoTranslate] no translation model selected')
                return false
            }
            await checkModelStatus(modelId, true)
            if (selectedModel.value?.id !== modelId || selectedModel.value.status !== 'downloaded') {
                translationMessage.value = '请先在设置中下载所选翻译模型'
                console.warn('[AutoTranslate] selected translation model is not downloaded', modelId)
                return false
            }
            translationReady.value = true
            translationMessage.value = `已准备翻译模型：${selectedModel.value.name}`
            log('translation model ready:', modelId)
            return true
        } catch (error) {
            translationMessage.value = '翻译模型检查失败，请到设置中重试'
            console.error('[AutoTranslate] translation model check failed', error)
            return false
        }
    }

    const ensurePageState = () => {
        const imageId = currentImageId.value
        if (!imageId) return null
        if (!pageStates.value[imageId]) pageStates.value[imageId] = createIdleState()
        return pageStates.value[imageId]!
    }

    const updateState = (stage: AutoTranslateStage, progress: number, message: string) => {
        const state = ensurePageState()
        if (!state) return
        state.stage = stage
        state.progress = progress
        state.message = message
        log(message)
    }

    const resetCurrentState = () => {
        if (!currentImageId.value) return
        pageStates.value[currentImageId.value] = createIdleState()
    }

    const getCurrentImageElement = () => {
        const imageElement = document.querySelector('img[alt^="当前图片"]') as HTMLImageElement | null
        if (!imageElement?.complete || !imageElement.naturalWidth) {
            throw new Error('当前图片尚未加载完成')
        }
        return imageElement
    }

    const imageToBase64 = (imageElement: HTMLImageElement) => {
        const canvas = document.createElement('canvas')
        canvas.width = imageElement.naturalWidth
        canvas.height = imageElement.naturalHeight
        canvas.getContext('2d')!.drawImage(imageElement, 0, 0)
        return canvas.toDataURL('image/png')
    }

    const cropRegion = (imageElement: HTMLImageElement, region: DetectedTextRegion) => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(region.width))
        canvas.height = Math.max(1, Math.round(region.height))
        canvas.getContext('2d')!.drawImage(
            imageElement,
            region.x, region.y, region.width, region.height,
            0, 0, canvas.width, canvas.height
        )
        return canvas.toDataURL('image/png')
    }

    const addRegionPadding = (
        region: DetectedTextRegion,
        imageWidth: number,
        imageHeight: number
    ): DetectedTextRegion => {
        const paddingX = Math.min(24, Math.max(6, region.width * 0.08))
        const paddingY = Math.min(24, Math.max(6, region.height * 0.08))
        const x = Math.max(0, region.x - paddingX)
        const y = Math.max(0, region.y - paddingY)
        const right = Math.min(imageWidth, region.x + region.width + paddingX)
        const bottom = Math.min(imageHeight, region.y + region.height + paddingY)
        return { ...region, x, y, width: right - x, height: bottom - y }
    }

    const createBlock = (region: DetectedTextRegion, index: number): OcrBlock => ({
        id: `${currentImageId.value}-${Date.now()}-${index}`,
        rect: { x: region.x, y: region.y, width: region.width, height: region.height },
        original: '',
        translation: '',
        tokens: [],
        status: 'loading',
        showOriginal: false
    })

    const translateBlock = async (block: OcrBlock) => {
        if (!settings.value.enableTranslation || !block.original) return
        const result = await window.electronAPI.translate(block.original, settings.value.translationModelId)
        if (!result.success) throw new Error(result.error || '翻译失败')
        block.translation = result.translation || ''
    }

    const processCurrentPage = async () => {
        if (!currentImageId.value || isProcessing.value) return
        if (!window.electronAPI?.detectTextRegions) {
            showToast('文字检测模块不可用，请先在设置中安装')
            return
        }
        if (!(await checkTranslationReady())) {
            showToast(translationMessage.value, 4000)
            return
        }

        isProcessing.value = true
        isOcrMode.value = false
        ocrBlocks.value = []
        activeBlockId.value = undefined
        resetCurrentState()

        try {
            const imageElement = getCurrentImageElement()
            updateState('detecting', 8, '正在分析整页文字区域')
            log('submitted full-page detection request')
            const heartbeat = window.setInterval(() => log('detector is still processing the current page'), 10000)
            let detection
            try {
                detection = await window.electronAPI.detectTextRegions(imageToBase64(imageElement))
            } finally {
                window.clearInterval(heartbeat)
            }
            if (!detection.success) throw new Error(detection.error || '文字区域检测失败')

            const regions = (detection.regions || []).map(region => addRegionPadding(
                region,
                imageElement.naturalWidth,
                imageElement.naturalHeight
            ))
            log('expanded detected regions with OCR padding', {
                imageWidth: imageElement.naturalWidth,
                imageHeight: imageElement.naturalHeight,
                regionCount: regions.length
            })
            log('detection completed, regions:', regions.length)
            if (regions.length === 0) {
                updateState('complete', 100, '当前页面未检测到文字区域')
                showToast('当前页面未检测到文字区域')
                return
            }

            ocrBlocks.value = regions.map(createBlock)
            activeBlockId.value = ocrBlocks.value[0]?.id

            for (let index = 0; index < regions.length; index++) {
                const region = regions[index]!
                const block = ocrBlocks.value[index]!
                updateState(
                    'recognizing',
                    15 + Math.round(((index + 1) / regions.length) * 45),
                    `正在识别第 ${index + 1} / ${regions.length} 个区域`
                )
                log('OCR started for region', index + 1, '/', regions.length)
                const result = await window.electronAPI.recognizeText(cropRegion(imageElement, region))
                if (!result.success) {
                    block.status = 'error'
                    console.error('[AutoTranslate] OCR failed for region', index + 1, result.error)
                    continue
                }
                block.original = result.text || ''
                block.status = 'done'
                log('OCR completed for region', index + 1)
            }

            if (settings.value.enableTranslation) {
                for (let index = 0; index < ocrBlocks.value.length; index++) {
                    const block = ocrBlocks.value[index]!
                    if (block.status === 'error' || !block.original) continue
                    updateState(
                        'translating',
                        60 + Math.round(((index + 1) / ocrBlocks.value.length) * 38),
                        `正在翻译第 ${index + 1} / ${ocrBlocks.value.length} 个区域`
                    )
                    log('translation started for region', index + 1, '/', ocrBlocks.value.length)
                    try {
                        block.status = 'loading'
                        await translateBlock(block)
                        block.status = 'done'
                        log('translation completed for region', index + 1)
                    } catch (error) {
                        block.status = 'error'
                        console.error('[AutoTranslate] translation failed for region', index + 1, error)
                    }
                }
            } else {
                console.warn('[AutoTranslate] translation was disabled after readiness check')
            }

            updateState('complete', 100, `已完成 ${ocrBlocks.value.length} 个文字区域`)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            updateState('error', 0, message)
            console.error('[AutoTranslate] page processing failed', error)
            showToast(`自动处理失败：${message}`, 5000)
        } finally {
            isProcessing.value = false
        }
    }

    const selectionToRegion = (selection: SelectionData, imageElement: HTMLImageElement): DetectedTextRegion => {
        const rect = imageElement.getBoundingClientRect()
        const ratio = Math.min(rect.width / imageElement.naturalWidth, rect.height / imageElement.naturalHeight)
        const renderedWidth = imageElement.naturalWidth * ratio
        const renderedHeight = imageElement.naturalHeight * ratio
        const gapX = (rect.width - renderedWidth) / 2
        const gapY = (rect.height - renderedHeight) / 2
        const rawX = (selection.left - rect.left - gapX) / ratio
        const rawY = (selection.top - rect.top - gapY) / ratio
        const x = Math.max(0, rawX)
        const y = Math.max(0, rawY)
        const right = Math.min(imageElement.naturalWidth, rawX + selection.width / ratio)
        const bottom = Math.min(imageElement.naturalHeight, rawY + selection.height / ratio)
        if (right <= x || bottom <= y) throw new Error('选区未包含有效图片内容')
        return { x, y, width: right - x, height: bottom - y, confidence: 1, direction: 'unknown' }
    }

    const startManualOcr = () => {
        if (!currentImageId.value || isProcessing.value || isOcrRecognizing.value) return
        isOcrMode.value = true
        log('manual OCR mode enabled')
    }

    const cancelManualOcr = () => {
        isOcrMode.value = false
        log('manual OCR mode cancelled')
    }

    const handleManualCapture = async (selection: SelectionData) => {
        isOcrMode.value = false
        isOcrRecognizing.value = true
        let block: OcrBlock | undefined
        try {
            const imageElement = getCurrentImageElement()
            const region = selectionToRegion(selection, imageElement)
            block = createBlock(region, ocrBlocks.value.length)
            ocrBlocks.value.push(block)
            activeBlockId.value = block.id
            log('manual OCR started for region', ocrBlocks.value.length)
            const result = await window.electronAPI.recognizeText(cropRegion(imageElement, region))
            if (!result.success) throw new Error(result.error || 'OCR 识别失败')
            block.original = result.text || ''
            log('manual OCR completed')
            if (settings.value.enableTranslation && block.original) {
                log('manual translation started')
                await translateBlock(block)
                log('manual translation completed')
            }
            block.status = 'done'
        } catch (error) {
            if (block) block.status = 'error'
            const message = error instanceof Error ? error.message : String(error)
            console.error('[AutoTranslate] manual OCR failed', error)
            showToast(message, 5000)
        } finally {
            isOcrRecognizing.value = false
        }
    }

    const handleReOcr = async (id: string) => {
        const block = ocrBlocks.value.find(item => item.id === id)
        if (!block) return
        try {
            block.status = 'loading'
            log('re-OCR started')
            const imageElement = getCurrentImageElement()
            const result = await window.electronAPI.recognizeText(cropRegion(imageElement, block.rect))
            if (!result.success) throw new Error(result.error || '重新识别失败')
            block.original = result.text || ''
            await translateBlock(block)
            block.status = 'done'
            log('re-OCR completed')
        } catch (error) {
            block.status = 'error'
            const message = error instanceof Error ? error.message : String(error)
            console.error('[AutoTranslate] re-OCR failed', error)
            showToast(message)
        }
    }

    return {
        currentState,
        detectorAvailable,
        translationReady,
        translationMessage,
        isProcessing,
        isOcrMode,
        isOcrRecognizing,
        log,
        checkTranslationReady,
        processCurrentPage,
        startManualOcr,
        cancelManualOcr,
        handleManualCapture,
        handleReOcr,
        translateBlock
    }
}
