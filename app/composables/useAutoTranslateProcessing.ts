import type { Ref } from 'vue'
import type { DetectedTextRegion, OcrBlock } from '~/types/interface'

export type AutoTranslateStage = 'idle' | 'detecting' | 'recognizing' | 'translating' | 'complete' | 'error'
export type ProcessingLogLevel = 'info' | 'success' | 'error'

export interface ProcessingLogEntry {
    id: number
    time: string
    message: string
    level: ProcessingLogLevel
}

export interface AutoTranslatePageState {
    stage: AutoTranslateStage
    progress: number
    message: string
    logs: ProcessingLogEntry[]
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
    message: '等待开始处理',
    logs: []
})

export function useAutoTranslateProcessing(options: AutoTranslateProcessingOptions) {
    const { currentImageId, ocrBlocks, activeBlockId } = options
    const { settings } = useSettings()
    const { showToast } = useToast()
    const pageStates = ref<Record<string, AutoTranslatePageState>>({})
    const isProcessing = ref(false)
    const isOcrMode = ref(false)
    const isOcrRecognizing = ref(false)
    let nextLogId = 1

    const detectorAvailable = computed(() => import.meta.client && Boolean(window.electronAPI?.detectTextRegions))
    const currentState = computed<AutoTranslatePageState>(() => {
        const imageId = currentImageId.value
        return imageId ? (pageStates.value[imageId] || createIdleState()) : createIdleState()
    })

    const ensurePageState = () => {
        const imageId = currentImageId.value
        if (!imageId) return null
        if (!pageStates.value[imageId]) pageStates.value[imageId] = createIdleState()
        return pageStates.value[imageId]!
    }

    const appendLog = (message: string, level: ProcessingLogLevel = 'info') => {
        const state = ensurePageState()
        if (!state) return
        state.logs.push({
            id: nextLogId++,
            time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            message,
            level
        })
        if (state.logs.length > 40) state.logs.splice(0, state.logs.length - 40)
    }

    const updateState = (
        stage: AutoTranslateStage,
        progress: number,
        message: string,
        logMessage = message,
        level: ProcessingLogLevel = 'info'
    ) => {
        const state = ensurePageState()
        if (!state) return
        state.stage = stage
        state.progress = progress
        state.message = message
        appendLog(logMessage, level)
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

        isProcessing.value = true
        isOcrMode.value = false
        ocrBlocks.value = []
        activeBlockId.value = undefined
        resetCurrentState()

        try {
            const imageElement = getCurrentImageElement()
            updateState('detecting', 8, '正在分析整页文字区域', '已提交整页图片，开始检测文字区域')
            const heartbeat = window.setInterval(() => appendLog('检测器仍在分析当前页面，请稍候'), 10000)
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
            appendLog(`检测完成，共找到 ${regions.length} 个文字区域`, 'success')
            if (regions.length === 0) {
                updateState('complete', 100, '当前页面未检测到文字区域', '处理完成，未检测到文字区域', 'success')
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
                    `正在识别第 ${index + 1} / ${regions.length} 个区域`,
                    `开始 OCR：区域 ${index + 1} / ${regions.length}`
                )
                const result = await window.electronAPI.recognizeText(cropRegion(imageElement, region))
                if (!result.success) {
                    block.status = 'error'
                    appendLog(`区域 ${index + 1} OCR 失败`, 'error')
                    continue
                }
                block.original = result.text || ''
                block.status = 'done'
                appendLog(`区域 ${index + 1} OCR 完成`, 'success')
            }

            if (settings.value.enableTranslation) {
                for (let index = 0; index < ocrBlocks.value.length; index++) {
                    const block = ocrBlocks.value[index]!
                    if (block.status === 'error' || !block.original) continue
                    updateState(
                        'translating',
                        60 + Math.round(((index + 1) / ocrBlocks.value.length) * 38),
                        `正在翻译第 ${index + 1} / ${ocrBlocks.value.length} 个区域`,
                        `开始翻译：区域 ${index + 1} / ${ocrBlocks.value.length}`
                    )
                    try {
                        block.status = 'loading'
                        await translateBlock(block)
                        block.status = 'done'
                        appendLog(`区域 ${index + 1} 翻译完成`, 'success')
                    } catch {
                        block.status = 'error'
                        appendLog(`区域 ${index + 1} 翻译失败`, 'error')
                    }
                }
            } else {
                appendLog('翻译功能未启用，本次仅完成 OCR')
            }

            updateState('complete', 100, `已完成 ${ocrBlocks.value.length} 个文字区域`, '当前页面处理完成', 'success')
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            updateState('error', 0, message, `处理失败：${message}`, 'error')
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
        appendLog('已进入手动画框模式')
    }

    const cancelManualOcr = () => {
        isOcrMode.value = false
        appendLog('已取消手动画框')
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
            appendLog(`已添加手动区域 ${ocrBlocks.value.length}，开始 OCR`)
            const result = await window.electronAPI.recognizeText(cropRegion(imageElement, region))
            if (!result.success) throw new Error(result.error || 'OCR 识别失败')
            block.original = result.text || ''
            appendLog('手动区域 OCR 完成', 'success')
            if (settings.value.enableTranslation && block.original) {
                appendLog('开始翻译手动区域')
                await translateBlock(block)
                appendLog('手动区域翻译完成', 'success')
            }
            block.status = 'done'
        } catch (error) {
            if (block) block.status = 'error'
            const message = error instanceof Error ? error.message : String(error)
            appendLog(`手动 OCR 失败：${message}`, 'error')
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
            appendLog('开始重新识别所选区域')
            const imageElement = getCurrentImageElement()
            const result = await window.electronAPI.recognizeText(cropRegion(imageElement, block.rect))
            if (!result.success) throw new Error(result.error || '重新识别失败')
            block.original = result.text || ''
            await translateBlock(block)
            block.status = 'done'
            appendLog('所选区域重新识别完成', 'success')
        } catch (error) {
            block.status = 'error'
            const message = error instanceof Error ? error.message : String(error)
            appendLog(`重新识别失败：${message}`, 'error')
            showToast(message)
        }
    }

    return {
        currentState,
        detectorAvailable,
        isProcessing,
        isOcrMode,
        isOcrRecognizing,
        appendLog,
        processCurrentPage,
        startManualOcr,
        cancelManualOcr,
        handleManualCapture,
        handleReOcr,
        translateBlock
    }
}
