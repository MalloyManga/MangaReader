<script setup lang="ts">
import type { DetectedTextRegion, OcrBlock } from '~/types/interface'

type ProcessingStage = 'idle' | 'detecting' | 'recognizing' | 'translating' | 'complete' | 'error'

interface PageProcessingState {
    stage: ProcessingStage
    progress: number
    message: string
}

const router = useRouter()
const { images, currentImageIndex, clearImages } = useMangaImages()
const { initSettings, settings } = useSettings()
const { showToast } = useToast()

const showSettingsModal = ref(false)
const activeBlockId = ref<string>()
const ocrBlocks = ref<OcrBlock[]>([])
const allPageBlocks = ref<Record<string, OcrBlock[]>>({})
const pageStates = ref<Record<string, PageProcessingState>>({})
const isProcessing = ref(false)

const currentImageId = computed(() => images.value[currentImageIndex.value]?.id)
const detectorAvailable = computed(() => import.meta.client && Boolean(window.electronAPI?.detectTextRegions))
const currentState = computed<PageProcessingState>(() => {
    const imageId = currentImageId.value
    if (imageId && pageStates.value[imageId]) return pageStates.value[imageId]!
    return { stage: 'idle', progress: 0, message: '等待开始处理' }
})

const stageLabel = computed(() => ({
    idle: '等待处理',
    detecting: '检测文字区域',
    recognizing: '识别原文',
    translating: '翻译文本',
    complete: '处理完成',
    error: '处理失败'
}[currentState.value.stage]))

watch(currentImageId, (newId, oldId) => {
    if (oldId) allPageBlocks.value[oldId] = [...ocrBlocks.value]
    ocrBlocks.value = newId && allPageBlocks.value[newId] ? [...allPageBlocks.value[newId]!] : []
    activeBlockId.value = undefined
})

watch(ocrBlocks, (blocks) => {
    if (currentImageId.value) allPageBlocks.value[currentImageId.value] = blocks
}, { deep: true })

const updateState = (stage: ProcessingStage, progress: number, message: string) => {
    if (!currentImageId.value) return
    pageStates.value[currentImageId.value] = { stage, progress, message }
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
        showToast('文字检测模块尚未接入，当前页面用于确认交互和布局', 3500)
        return
    }

    isProcessing.value = true
    ocrBlocks.value = []
    activeBlockId.value = undefined

    try {
        const imageElement = getCurrentImageElement()
        updateState('detecting', 8, '正在分析整页文字区域')
        const detection = await window.electronAPI.detectTextRegions(imageToBase64(imageElement))
        if (!detection.success) throw new Error(detection.error || '文字区域检测失败')

        const regions = detection.regions || []
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
            updateState('recognizing', 15 + Math.round(((index + 1) / regions.length) * 45), `正在识别第 ${index + 1} / ${regions.length} 个区域`)
            const result = await window.electronAPI.recognizeText(cropRegion(imageElement, region))
            if (!result.success) {
                block.status = 'error'
                continue
            }
            block.original = result.text || ''
            block.status = 'done'
        }

        if (settings.value.enableTranslation) {
            for (let index = 0; index < ocrBlocks.value.length; index++) {
                const block = ocrBlocks.value[index]!
                if (block.status === 'error' || !block.original) continue
                updateState('translating', 60 + Math.round(((index + 1) / ocrBlocks.value.length) * 38), `正在翻译第 ${index + 1} / ${ocrBlocks.value.length} 个区域`)
                try {
                    block.status = 'loading'
                    await translateBlock(block)
                    block.status = 'done'
                } catch {
                    block.status = 'error'
                }
            }
        }

        updateState('complete', 100, `已完成 ${ocrBlocks.value.length} 个文字区域`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateState('error', 0, message)
        showToast(`自动处理失败：${message}`, 5000)
    } finally {
        isProcessing.value = false
    }
}

const handleSelectBlock = (id: string) => {
    activeBlockId.value = id
}

const handleDeleteBlock = (id: string) => {
    ocrBlocks.value = ocrBlocks.value.filter(block => block.id !== id)
    if (activeBlockId.value === id) activeBlockId.value = ocrBlocks.value[0]?.id
}

const handleUpdateBlock = (updatedBlock: OcrBlock) => {
    const index = ocrBlocks.value.findIndex(block => block.id === updatedBlock.id)
    if (index === -1) return
    const originalChanged = ocrBlocks.value[index]!.original !== updatedBlock.original
    ocrBlocks.value[index] = updatedBlock
    if (originalChanged && updatedBlock.original && settings.value.enableTranslation) {
        updatedBlock.status = 'loading'
        translateBlock(updatedBlock)
            .then(() => { updatedBlock.status = 'done' })
            .catch(() => { updatedBlock.status = 'error' })
    }
}

const handleReOcr = async (id: string) => {
    const block = ocrBlocks.value.find(item => item.id === id)
    if (!block) return
    try {
        block.status = 'loading'
        const imageElement = getCurrentImageElement()
        const result = await window.electronAPI.recognizeText(cropRegion(imageElement, block.rect))
        if (!result.success) throw new Error(result.error || '重新识别失败')
        block.original = result.text || ''
        await translateBlock(block)
        block.status = 'done'
    } catch (error) {
        block.status = 'error'
        showToast(error instanceof Error ? error.message : String(error))
    }
}

const goBack = () => {
    clearImages()
    router.push('/')
}

onMounted(initSettings)
onUnmounted(clearImages)
</script>

<template>
    <div class="min-h-screen bg-manga-50 dark:bg-manga-700">
        <ToastContainer />
        <TitleBar @open-settings="showSettingsModal = true">
            <template #extra-buttons>
                <Button class="text-sm font-bold" variant="secondary" @btn-click="goBack">
                    📚 返回书架
                </Button>
            </template>
        </TitleBar>

        <main class="max-w-screen-2xl mx-auto p-4">
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[calc(100vh-80px)]">
                <section class="relative h-full lg:col-span-3 min-h-0">
                    <FileUpload>
                        <template #overlay="{ naturalSize, containerSize }">
                            <BubbleLayer v-if="ocrBlocks.length" :blocks="ocrBlocks"
                                :image-natural-size="naturalSize" :container-size="containerSize"
                                @select-block="handleSelectBlock" @update-block="handleUpdateBlock"
                                @delete-block="handleDeleteBlock" @re-ocr="handleReOcr" />
                        </template>
                    </FileUpload>
                </section>

                <aside class="lg:col-span-2 min-h-0 flex flex-col gap-4">
                    <section
                        class="shrink-0 bg-white dark:bg-manga-800 border border-manga-200 dark:border-manga-600 rounded-primary shadow-sm p-5">
                        <div class="flex items-start justify-between gap-4 mb-5">
                            <div>
                                <div class="flex items-center gap-2 text-manga-900 dark:text-manga-100">
                                    <IconAutoDetect class="size-6 text-primary" />
                                    <h1 class="font-bold text-lg">自动识别翻译</h1>
                                </div>
                                <p class="text-xs text-manga-500 dark:text-manga-400 mt-1.5">
                                    自动检测当前页面的文字区域，并复用现有 OCR 与翻译模型。
                                </p>
                            </div>
                            <span class="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium"
                                :class="detectorAvailable
                                    ? 'bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-300'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300'">
                                {{ detectorAvailable ? '检测器可用' : '检测模块待接入' }}
                            </span>
                        </div>

                        <div class="flex items-center justify-between text-xs mb-2">
                            <span class="font-medium text-manga-700 dark:text-manga-300">{{ stageLabel }}</span>
                            <span class="tabular-nums text-manga-500">{{ currentState.progress }}%</span>
                        </div>
                        <div class="h-2 bg-manga-100 dark:bg-manga-700 rounded-full overflow-hidden">
                            <div class="h-full bg-primary rounded-full transition-all duration-300"
                                :class="currentState.stage === 'error' ? 'bg-red-500' : ''"
                                :style="{ width: `${currentState.progress}%` }" />
                        </div>
                        <p class="text-xs text-manga-500 dark:text-manga-400 mt-2 min-h-4">
                            {{ currentState.message }}
                        </p>

                        <button type="button" :disabled="!images.length || isProcessing || !detectorAvailable"
                            class="mt-4 w-full min-h-11 rounded-primary bg-primary text-white font-bold flex items-center justify-center gap-2 transition-all enabled:hover:opacity-90 enabled:hover:-translate-y-px disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                            @click="processCurrentPage">
                            <IconAutoDetect class="size-5" />
                            {{ isProcessing ? '正在处理当前页' : '处理当前页' }}
                        </button>
                    </section>

                    <BubbleList class="flex-1 min-h-0 rounded-primary overflow-hidden border border-manga-200 dark:border-manga-600"
                        :blocks="ocrBlocks" :active-id="activeBlockId" title="识别区域"
                        empty-text="尚未生成文字区域" empty-hint="导入图片并处理后，可在这里检查和修改"
                        @select-block="handleSelectBlock" @update-block="handleUpdateBlock"
                        @delete-block="handleDeleteBlock" />
                </aside>
            </div>
        </main>

        <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
    </div>
</template>
