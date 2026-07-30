import type { Ref } from 'vue'
import type { DetectedTextRegion, ImageItem, OcrBlock } from '~/types/interface'

export type AutoTranslateStage = 'idle' | 'detecting' | 'recognizing' | 'translating' | 'complete' | 'stopped' | 'error'

export interface AutoTranslatePageState {
    stage: AutoTranslateStage
    progress: number
    message: string
}

interface AutoTranslateProcessingOptions {
    currentImageId: Ref<string | undefined>
    images: Ref<ImageItem[]>
    ocrBlocks: Ref<OcrBlock[]>
    allPageBlocks: Ref<Record<string, OcrBlock[]>>
    activeBlockId: Ref<string | undefined>
    persistPageBlocks?: (imageId: string, blocks: OcrBlock[]) => void | Promise<void>
}

export interface AutoTranslateBatchState {
    show: boolean
    status: 'idle' | 'running' | 'stopping' | 'complete' | 'stopped'
    stage: AutoTranslateStage
    pageIndex: number
    pageTotal: number
    regionIndex: number
    regionTotal: number
    progress: number
    message: string
    pageLabel: string
    completedPages: number
    failedPages: number
    skippedPages: number
}

interface ProcessingToken {
    cancelled: boolean
    kind: 'single' | 'batch'
    imageId?: string
}

let activeToken: ProcessingToken | null = null
let activeStopHandler: (() => void) | null = null

export const stopActiveAutoTranslateTask = () => activeStopHandler?.()

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
    const { currentImageId, images, ocrBlocks, allPageBlocks, activeBlockId, persistPageBlocks } = options
    const { settings } = useSettings()
    const { showToast } = useToast()
    const { selectedModel, loadTranslationModels, checkModelStatus } = useModelStatus()
    const {
        pageStates,
        processedPageIds,
        batchState,
        isPreparing,
        isCurrentPageProcessing,
        isBatchProcessing,
        isStopping,
        isProcessing,
        taskContext,
        deletedPageRegions
    } = useAutoTranslateSession()
    const isOcrMode = ref(false)
    const isOcrRecognizing = ref(false)
    const translationReady = ref(false)
    const translationMessage = ref('正在检查翻译模型')

    const detectorAvailable = computed(() => import.meta.client && Boolean(window.electronAPI?.detectTextRegions))
    const currentState = computed<AutoTranslatePageState>(() => {
        const imageId = currentImageId.value
        return imageId ? (pageStates.value[imageId] || createIdleState()) : createIdleState()
    })
    const panelState = computed<AutoTranslatePageState>(() => batchState.value.show ? {
        stage: batchState.value.stage,
        progress: batchState.value.progress,
        message: batchState.value.message
    } : currentState.value)

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
            const model = await checkModelStatus(modelId)
            if (selectedModel.value?.id !== modelId) {
                translationMessage.value = '请选择有效的翻译模型'
                console.warn('[AutoTranslate] selected translation model is invalid', modelId)
                return false
            }
            if (model?.status === 'check_failed') {
                translationMessage.value = '翻译模型检查失败，请在设置中重新检查'
                console.error('[AutoTranslate] translation model check failed', model.lastError)
                return false
            }
            if (model?.status !== 'downloaded') {
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

    const ensurePageState = (imageId = currentImageId.value) => {
        if (!imageId) return null
        if (!pageStates.value[imageId]) pageStates.value[imageId] = createIdleState()
        return pageStates.value[imageId]!
    }

    const updateState = (imageId: string, stage: AutoTranslateStage, progress: number, message: string) => {
        const state = ensurePageState(imageId)
        if (!state) return
        state.stage = stage
        state.progress = progress
        state.message = message
        log(message)
    }

    const resetPageState = (imageId: string) => {
        pageStates.value[imageId] = createIdleState()
    }

    const markPageProcessed = (imageId: string) => {
        processedPageIds.value[imageId] = true
        Promise.resolve(persistPageBlocks?.(imageId, allPageBlocks.value[imageId] || [])).catch(error => {
            console.error('[AutoTranslate] failed to persist processed page state', imageId, error)
        })
        log('page marked as processed', imageId)
    }

    const unmarkPageProcessed = (imageId: string) => {
        if (!processedPageIds.value[imageId]) return
        delete processedPageIds.value[imageId]
        Promise.resolve(persistPageBlocks?.(imageId, allPageBlocks.value[imageId] || [])).catch(error => {
            console.error('[AutoTranslate] failed to persist unprocessed page state', imageId, error)
        })
        log('page marked as unprocessed', imageId)
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

    const regionOverlapRatio = (
        first: Pick<DetectedTextRegion, 'x' | 'y' | 'width' | 'height'>,
        second: Pick<DetectedTextRegion, 'x' | 'y' | 'width' | 'height'>
    ) => {
        const intersectionWidth = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x))
        const intersectionHeight = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y))
        const intersection = intersectionWidth * intersectionHeight
        const smallerArea = Math.min(first.width * first.height, second.width * second.height)
        return smallerArea > 0 ? intersection / smallerArea : 0
    }

    const isDeletedRegion = (imageId: string, region: DetectedTextRegion) => (
        deletedPageRegions.value[imageId]?.some(deleted => regionOverlapRatio(region, deleted) >= 0.6) || false
    )

    const createBlock = (
        imageId: string,
        region: DetectedTextRegion,
        index: number,
        source: 'manual' | 'auto' = 'auto'
    ): OcrBlock => ({
        id: `${imageId}-${Date.now()}-${index}`,
        source,
        rect: { x: region.x, y: region.y, width: region.width, height: region.height },
        original: '',
        translation: '',
        tokens: [],
        status: 'loading',
        showOriginal: false
    })

    const translateBlock = async (block: OcrBlock) => {
        if (!block.original) throw new Error('没有可翻译的原文')
        const startedAt = performance.now()
        log('translation request started', { blockId: block.id, modelId: settings.value.translationModelId })
        const result = await window.electronAPI.translate(block.original, settings.value.translationModelId)
        if (!result.success || !result.translation?.trim()) throw new Error(result.error || '翻译结果为空')
        block.translation = result.translation
        log('translation request completed', {
            blockId: block.id,
            modelId: settings.value.translationModelId,
            elapsedMs: Math.round(performance.now() - startedAt)
        })
    }

    const replacePageBlocks = (imageId: string, blocks: OcrBlock[]) => {
        allPageBlocks.value[imageId] = [...blocks]
        Promise.resolve(persistPageBlocks?.(imageId, blocks)).catch(error => {
            console.error('[AutoTranslate] failed to persist page blocks', imageId, error)
        })
        if (currentImageId.value === imageId) {
            ocrBlocks.value = [...blocks]
            activeBlockId.value = blocks[0]?.id
        }
    }

    const appendCompletedBlock = (imageId: string, block: OcrBlock) => {
        const blocks = [...(allPageBlocks.value[imageId] || []), block]
        replacePageBlocks(imageId, blocks)
    }

    const persistBlocksForImage = async (imageId: string) => {
        const blocks = currentImageId.value === imageId
            ? [...ocrBlocks.value]
            : [...(allPageBlocks.value[imageId] || [])]
        allPageBlocks.value[imageId] = blocks
        await persistPageBlocks?.(imageId, blocks)
    }

    const throwIfCancelled = (token: ProcessingToken) => {
        if (token.cancelled) throw new DOMException('处理已停止', 'AbortError')
    }

    const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

    const hasManualBlocks = (imageId: string) => Boolean(
        allPageBlocks.value[imageId]?.some(block => block.source === 'manual')
    )

    const updateProcessingProgress = (
        imageId: string,
        token: ProcessingToken,
        stage: AutoTranslateStage,
        progress: number,
        message: string,
        regionIndex = 0,
        regionTotal = 0
    ) => {
        updateState(imageId, stage, progress, message)
        if (activeToken === token) {
            taskContext.value.imageId = imageId
            taskContext.value.stage = stage
            taskContext.value.regionIndex = regionIndex
            taskContext.value.regionTotal = regionTotal
        }
        if (token.kind !== 'batch') return
        if (activeToken !== token) return
        batchState.value.stage = stage
        batchState.value.regionIndex = regionIndex
        batchState.value.regionTotal = regionTotal
        const pageProgress = `第 ${batchState.value.pageIndex} / ${batchState.value.pageTotal} 页`
        if (stage === 'detecting') {
            batchState.value.message = `正在分析${pageProgress}文字区域`
        } else if (stage === 'recognizing') {
            batchState.value.message = `正在识别${pageProgress}的第 ${regionIndex} / ${regionTotal} 个文字框`
        } else if (stage === 'translating') {
            batchState.value.message = `正在翻译${pageProgress}的第 ${regionIndex} / ${regionTotal} 个文字框`
        } else {
            batchState.value.message = message
        }
        batchState.value.progress = Math.min(100, Math.round(
            ((batchState.value.pageIndex - 1 + progress / 100) / Math.max(1, batchState.value.pageTotal)) * 100
        ))
    }

    const processPage = async (imageId: string, imageElement: HTMLImageElement, token: ProcessingToken) => {
        unmarkPageProcessed(imageId)
        replacePageBlocks(imageId, [])
        resetPageState(imageId)

        try {
            updateProcessingProgress(imageId, token, 'detecting', 8, '正在分析整页文字区域')
            log('submitted full-page detection request', imageId)
            const heartbeat = window.setInterval(() => log('detector is still processing page', imageId), 10000)
            let detection
            try {
                detection = await window.electronAPI.detectTextRegions(imageToBase64(imageElement))
            } finally {
                window.clearInterval(heartbeat)
            }
            throwIfCancelled(token)
            if (!detection.success) throw new Error(detection.error || '文字区域检测失败')

            const detectedRegions = (detection.regions || []).map(region => addRegionPadding(
                region,
                imageElement.naturalWidth,
                imageElement.naturalHeight
            ))
            const regions = detectedRegions.filter(region => !isDeletedRegion(imageId, region))
            log('expanded detected regions with OCR padding', {
                imageId,
                imageWidth: imageElement.naturalWidth,
                imageHeight: imageElement.naturalHeight,
                regionCount: regions.length,
                ignoredRegionCount: detectedRegions.length - regions.length
            })
            if (regions.length === 0) {
                updateProcessingProgress(imageId, token, 'complete', 100, '当前页面未检测到文字区域')
                markPageProcessed(imageId)
                return 'complete' as const
            }

            let completedCount = 0
            for (let index = 0; index < regions.length; index++) {
                throwIfCancelled(token)
                const region = regions[index]!
                if (isDeletedRegion(imageId, region)) {
                    log('skipped region deleted during processing', index + 1, 'on page', imageId)
                    continue
                }
                const block = createBlock(imageId, region, index)
                updateProcessingProgress(
                    imageId,
                    token,
                    'recognizing',
                    15 + Math.round(((index + 0.35) / regions.length) * 83),
                    `正在识别第 ${index + 1} / ${regions.length} 个区域`,
                    index + 1,
                    regions.length
                )
                log('OCR started for region', index + 1, '/', regions.length, 'on page', imageId)
                const result = await window.electronAPI.recognizeText(cropRegion(imageElement, region))
                throwIfCancelled(token)
                if (!result.success || !result.text?.trim()) {
                    console.error('[AutoTranslate] OCR failed for region', index + 1, result.error || 'empty text')
                    continue
                }
                block.original = result.text
                log('OCR completed for region', index + 1, 'on page', imageId)

                updateProcessingProgress(
                    imageId,
                    token,
                    'translating',
                    15 + Math.round(((index + 0.75) / regions.length) * 83),
                    `正在翻译第 ${index + 1} / ${regions.length} 个区域`,
                    index + 1,
                    regions.length
                )
                try {
                    await translateBlock(block)
                    throwIfCancelled(token)
                } catch (error) {
                    if (isAbortError(error)) throw error
                    console.error('[AutoTranslate] translation failed for region', index + 1, error)
                    continue
                }

                block.status = 'done'
                appendCompletedBlock(imageId, block)
                completedCount++
                log('atomic region committed', index + 1, 'on page', imageId)
            }

            updateProcessingProgress(
                imageId,
                token,
                'complete',
                100,
                `已完成 ${completedCount} / ${regions.length} 个文字区域`,
                regions.length,
                regions.length
            )
            markPageProcessed(imageId)
            return 'complete' as const
        } catch (error) {
            if (isAbortError(error)) {
                log('page processing stopped', imageId)
                return 'stopped' as const
            }
            const message = error instanceof Error ? error.message : String(error)
            updateState(imageId, 'error', 0, message)
            console.error('[AutoTranslate] page processing failed', imageId, error)
            return 'error' as const
        }
    }

    const canStartProcessing = async () => {
        if (!window.electronAPI?.detectTextRegions) {
            showToast('文字检测模块不可用，请先在设置中安装')
            return false
        }
        if (!(await checkTranslationReady())) {
            showToast(translationMessage.value, 4000)
            return false
        }
        return true
    }

    const prepareProcessing = async () => {
        isPreparing.value = true
        try {
            return await canStartProcessing()
        } finally {
            isPreparing.value = false
        }
    }

    const processCurrentPage = async () => {
        if (isCurrentPageProcessing.value) {
            stopProcessing()
            return
        }
        const imageId = currentImageId.value
        if (!imageId || isProcessing.value) return
        if (hasManualBlocks(imageId)) {
            const message = '当前页面存在手动添加的文字框，请先清除后再进行自动处理'
            updateState(imageId, 'idle', 0, message)
            showToast(message, 4000)
            return
        }
        if (!(await prepareProcessing())) return

        const token: ProcessingToken = { cancelled: false, kind: 'single', imageId }
        activeToken = token
        activeStopHandler = stopProcessing
        isCurrentPageProcessing.value = true
        isStopping.value = false
        isOcrMode.value = false
        activeBlockId.value = undefined
        taskContext.value.imageId = imageId
        taskContext.value.pageIndex = images.value.findIndex(image => image.id === imageId) + 1
        taskContext.value.pageTotal = images.value.length
        taskContext.value.regionIndex = 0
        taskContext.value.regionTotal = 0

        try {
            const image = images.value.find(item => item.id === imageId)
            if (!image) throw new Error('当前页面图片不存在')
            const imageElement = await loadImageElement(image.url)
            const result = await processPage(imageId, imageElement, token)
            if (result === 'error') showToast('当前页面自动处理失败，请查看处理状态', 5000)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            updateState(imageId, 'error', 0, message)
            console.error('[AutoTranslate] page processing failed', error)
            showToast(`自动处理失败：${message}`, 5000)
        } finally {
            if (activeToken === token) {
                activeToken = null
                activeStopHandler = null
                isCurrentPageProcessing.value = false
                isStopping.value = false
            }
        }
    }

    const loadImageElement = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('页面图片加载失败'))
        image.src = url
    })

    const getPageLabel = (image: ImageItem, index: number) => image.file?.name
        || (image.type === 'pdf-page' && image.pageNumber ? `PDF 第 ${image.pageNumber} 页` : `第 ${index + 1} 页`)

    const processAllPages = async () => {
        if (!images.value.length || isProcessing.value) return
        if (!(await prepareProcessing())) return
        const token: ProcessingToken = { cancelled: false, kind: 'batch' }
        activeToken = token
        activeStopHandler = stopProcessing
        isBatchProcessing.value = true
        isStopping.value = false
        isOcrMode.value = false
        Object.assign(batchState.value, {
            show: true,
            status: 'running',
            stage: 'idle',
            pageIndex: 0,
            pageTotal: images.value.length,
            regionIndex: 0,
            regionTotal: 0,
            progress: 0,
            message: '正在准备批量处理',
            pageLabel: '',
            completedPages: 0,
            failedPages: 0,
            skippedPages: 0
        })
        taskContext.value.pageTotal = images.value.length
        taskContext.value.regionIndex = 0
        taskContext.value.regionTotal = 0
        log('batch processing started, page count:', images.value.length)

        try {
            for (let index = 0; index < images.value.length; index++) {
                throwIfCancelled(token)
                const image = images.value[index]!
                batchState.value.pageIndex = index + 1
                taskContext.value.imageId = image.id
                taskContext.value.pageIndex = index + 1
                batchState.value.pageLabel = getPageLabel(image, index)
                batchState.value.regionIndex = 0
                batchState.value.regionTotal = 0

                if (hasManualBlocks(image.id)) {
                    batchState.value.skippedPages++
                    batchState.value.message = `第 ${index + 1} / ${images.value.length} 页存在手动画框，已跳过`
                    batchState.value.progress = Math.round(((index + 1) / images.value.length) * 100)
                    log('skipped page with manual blocks', image.id)
                    continue
                }

                if (processedPageIds.value[image.id]) {
                    batchState.value.skippedPages++
                    batchState.value.message = '该页面已经完整处理，已跳过'
                    batchState.value.progress = Math.round(((index + 1) / images.value.length) * 100)
                    log('skipped completed page', image.id)
                    continue
                }

                try {
                    const imageElement = await loadImageElement(image.url)
                    throwIfCancelled(token)
                    const result = await processPage(image.id, imageElement, token)
                    if (result === 'stopped') break
                    if (result === 'complete') batchState.value.completedPages++
                    else batchState.value.failedPages++
                } catch (error) {
                    if (isAbortError(error)) throw error
                    batchState.value.failedPages++
                    updateState(image.id, 'error', 0, error instanceof Error ? error.message : String(error))
                    console.error('[AutoTranslate] batch page failed', image.id, error)
                }
            }
            if (activeToken !== token) return
            if (token.cancelled) {
                batchState.value.status = 'stopped'
                batchState.value.message = '批量处理已停止，仅保留完整处理的文字区域'
            } else {
                batchState.value.status = 'complete'
                batchState.value.stage = 'complete'
                batchState.value.progress = 100
                batchState.value.message = '全部页面处理完成'
            }
        } catch (error) {
            if (activeToken !== token) return
            if (isAbortError(error)) {
                batchState.value.status = 'stopped'
                batchState.value.message = '批量处理已停止，仅保留完整处理的文字区域'
            } else {
                batchState.value.status = 'complete'
                batchState.value.stage = 'error'
                batchState.value.failedPages++
                batchState.value.message = '批量处理提前结束，请检查失败页面'
                console.error('[AutoTranslate] batch processing failed', error)
            }
        } finally {
            if (activeToken === token) {
                activeToken = null
                activeStopHandler = null
                isBatchProcessing.value = false
                isStopping.value = false
                log('batch processing ended', batchState.value.status)
            }
        }
    }

    function stopProcessing() {
        if (!activeToken || activeToken.cancelled) return
        const wasDetecting = taskContext.value.stage === 'detecting'
        activeToken.cancelled = true
        log('stop requested for', activeToken.kind, 'processing')
        if (wasDetecting) {
            window.electronAPI.cancelTextDetection?.().then((result) => {
                if (!result.success) console.warn('[AutoTranslate] detector cancellation failed', result.error)
                else log('active detector process cancelled')
            })
        }
        if (activeToken.kind === 'batch') {
            isBatchProcessing.value = false
            batchState.value.status = 'stopped'
            batchState.value.stage = 'stopped'
            batchState.value.progress = 0
            batchState.value.message = '批量处理已停止，仅保留完整处理的文字区域'
            taskContext.value.stage = 'stopped'
        } else if (activeToken.imageId) {
            isCurrentPageProcessing.value = false
            updateState(
                activeToken.imageId,
                'stopped',
                0,
                `已停止，保留 ${allPageBlocks.value[activeToken.imageId]?.length || 0} 个完整区域`
            )
            taskContext.value.stage = 'stopped'
        }
        activeToken = null
        activeStopHandler = null
        isStopping.value = false
    }

    const closeBatchModal = () => {
        if (isBatchProcessing.value) return
        batchState.value.show = false
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
        const imageId = currentImageId.value
        if (!imageId) return
        isOcrMode.value = false
        isOcrRecognizing.value = true
        let block: OcrBlock | undefined
        try {
            const imageElement = getCurrentImageElement()
            const region = selectionToRegion(selection, imageElement)
            if (deletedPageRegions.value[imageId]?.length) {
                deletedPageRegions.value[imageId] = deletedPageRegions.value[imageId]!.filter(
                    deleted => regionOverlapRatio(region, deleted) < 0.6
                )
            }
            const createdBlock = createBlock(imageId, region, ocrBlocks.value.length, 'manual')
            ocrBlocks.value.push(createdBlock)
            // Vue wraps array entries on access; keep mutating that proxy so async results repaint immediately.
            block = ocrBlocks.value[ocrBlocks.value.length - 1]!
            allPageBlocks.value[imageId] = [...ocrBlocks.value]
            activeBlockId.value = block.id
            log('manual OCR started for region', ocrBlocks.value.length)
            const ocrStartedAt = performance.now()
            const result = await window.electronAPI.recognizeText(cropRegion(imageElement, region))
            if (!result.success) throw new Error(result.error || 'OCR 识别失败')
            block.original = result.text || ''
            log('manual OCR completed', { elapsedMs: Math.round(performance.now() - ocrStartedAt) })
            if (settings.value.enableTranslation && block.original) {
                log('manual translation started')
                await translateBlock(block)
                log('manual translation completed')
            }
            block.status = 'done'
            markPageProcessed(imageId)
        } catch (error) {
            if (block) block.status = 'error'
            const message = error instanceof Error ? error.message : String(error)
            console.error('[AutoTranslate] manual OCR failed', error)
            showToast(message, 5000)
        } finally {
            try {
                await persistBlocksForImage(imageId)
                log('manual OCR block persisted', imageId)
            } catch (error) {
                console.error('[AutoTranslate] failed to persist manual OCR block', imageId, error)
            }
            isOcrRecognizing.value = false
        }
    }

    const handleReOcr = async (id: string) => {
        const imageId = currentImageId.value
        if (!imageId) return
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
        } finally {
            try {
                await persistBlocksForImage(imageId)
            } catch (error) {
                console.error('[AutoTranslate] failed to persist re-OCR block', imageId, error)
            }
        }
    }

    return {
        currentState,
        panelState,
        detectorAvailable,
        translationReady,
        translationMessage,
        batchState,
        processedPageIds,
        isProcessing,
        isCurrentPageProcessing,
        isBatchProcessing,
        isStopping,
        isOcrMode,
        isOcrRecognizing,
        log,
        checkTranslationReady,
        processCurrentPage,
        processAllPages,
        stopProcessing,
        closeBatchModal,
        unmarkPageProcessed,
        startManualOcr,
        cancelManualOcr,
        handleManualCapture,
        handleReOcr,
        translateBlock
    }
}
