<script setup lang="ts">
import type { OcrBlock } from '~/types/interface'

const router = useRouter()
const { images, currentImageIndex, clearImages } = useMangaImages()
const { initSettings, settings } = useSettings()

const showSettingsModal = ref(false)
const activeBlockId = ref<string>()
const ocrBlocks = ref<OcrBlock[]>([])
const allPageBlocks = ref<Record<string, OcrBlock[]>>({})
const currentImageId = computed(() => images.value[currentImageIndex.value]?.id)
const splitPaneConfig = {
    defaultLeftPercent: 60,
    minLeftPercent: 50,
    maxLeftPercent: 80
} as const

const {
    currentState,
    panelState,
    detectorAvailable,
    translationReady,
    translationMessage,
    batchState,
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
} = useAutoTranslateProcessing({ currentImageId, images, ocrBlocks, allPageBlocks, activeBlockId })

watch(currentImageId, (newId, oldId) => {
    if (oldId) allPageBlocks.value[oldId] = [...ocrBlocks.value]
    ocrBlocks.value = newId && allPageBlocks.value[newId] ? [...allPageBlocks.value[newId]!] : []
    activeBlockId.value = undefined
    isOcrMode.value = false
})

watch(ocrBlocks, (blocks) => {
    if (currentImageId.value) allPageBlocks.value[currentImageId.value] = blocks
}, { deep: true })

const handleSelectBlock = (id: string) => {
    activeBlockId.value = id
}

const handleDeleteBlock = (id: string) => {
    ocrBlocks.value = ocrBlocks.value.filter(block => block.id !== id)
    if (activeBlockId.value === id) activeBlockId.value = ocrBlocks.value[0]?.id
    const imageId = currentImageId.value
    if (imageId && !ocrBlocks.value.some(block => block.status === 'done' && block.original && block.translation)) {
        unmarkPageProcessed(imageId)
    }
    log('deleted OCR block:', id)
}

const handleUpdateBlock = (updatedBlock: OcrBlock) => {
    const index = ocrBlocks.value.findIndex(block => block.id === updatedBlock.id)
    if (index === -1) return
    const originalChanged = ocrBlocks.value[index]!.original !== updatedBlock.original
    ocrBlocks.value[index] = updatedBlock
    if (originalChanged && updatedBlock.original && settings.value.enableTranslation) {
        updatedBlock.status = 'loading'
        log('original text changed; translating block:', updatedBlock.id)
        translateBlock(updatedBlock)
            .then(() => {
                updatedBlock.status = 'done'
                log('updated block translation completed:', updatedBlock.id)
            })
            .catch((error) => {
                updatedBlock.status = 'error'
                console.error('[AutoTranslate] updated block translation failed', updatedBlock.id, error)
            })
    }
}

const toggleManualOcr = () => {
    if (isOcrMode.value) cancelManualOcr()
    else startManualOcr()
}

const goBack = () => {
    stopProcessing()
    clearImages()
    router.push('/')
}

const handleSettingsClose = async () => {
    showSettingsModal.value = false
    await checkTranslationReady()
}

onMounted(async () => {
    await initSettings()
    await checkTranslationReady()
})
onUnmounted(() => {
    stopProcessing()
    clearImages()
})
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
            <ResizableSplitPane v-bind="splitPaneConfig" height="calc(100vh - 80px)">
                <template #left>
                <section class="relative h-full min-w-0 min-h-0 overflow-hidden pr-2">
                    <FileUpload>
                        <template #overlay="{ naturalSize, containerSize }">
                            <BubbleLayer v-if="ocrBlocks.length" :blocks="ocrBlocks"
                                :image-natural-size="naturalSize" :container-size="containerSize"
                                @select-block="handleSelectBlock" @update-block="handleUpdateBlock"
                                @delete-block="handleDeleteBlock" @re-ocr="handleReOcr" />
                        </template>
                    </FileUpload>
                    <OcrOverlay v-if="isOcrMode" @capture-complete="handleManualCapture"
                        @cancel="cancelManualOcr" />
                </section>
                </template>

                <template #right>
                <aside class="min-w-0 min-h-0 h-full overflow-hidden flex flex-col gap-4 pl-2">
                    <AutoTranslatePanel :state="panelState" :detector-available="detectorAvailable"
                        :translation-ready="translationReady" :translation-message="translationMessage"
                        :has-images="Boolean(images.length)" :is-processing="isProcessing"
                        :is-current-page-processing="isCurrentPageProcessing"
                        :is-batch-processing="isBatchProcessing" :is-stopping="isStopping"
                        :is-ocr-mode="isOcrMode" :is-ocr-recognizing="isOcrRecognizing"
                        @process="processCurrentPage" @process-all="processAllPages"
                        @manual-ocr="toggleManualOcr" />

                    <BubbleList
                        class="flex-1 min-h-0 rounded-primary overflow-hidden border border-manga-200 dark:border-manga-600"
                        :blocks="ocrBlocks" :active-id="activeBlockId" title="识别区域"
                        empty-text="尚未生成文字区域" empty-hint="自动处理或手动画框后，可在这里检查和修改"
                        @select-block="handleSelectBlock" @update-block="handleUpdateBlock"
                        @delete-block="handleDeleteBlock" />
                </aside>
                </template>
            </ResizableSplitPane>
        </main>

        <SettingsModal :show="showSettingsModal" @close="handleSettingsClose" />
        <AutoTranslateBatchModal :state="batchState" :is-processing="isBatchProcessing"
            :is-stopping="isStopping" @stop="stopProcessing" @close="closeBatchModal" />
    </div>
</template>
