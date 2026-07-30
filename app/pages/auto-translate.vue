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

const {
    currentState,
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
                    <OcrOverlay v-if="isOcrMode" @capture-complete="handleManualCapture"
                        @cancel="cancelManualOcr" />
                </section>

                <aside class="lg:col-span-2 min-h-0 flex flex-col gap-4">
                    <AutoTranslatePanel :state="currentState" :detector-available="detectorAvailable"
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
            </div>
        </main>

        <SettingsModal :show="showSettingsModal" @close="handleSettingsClose" />
        <AutoTranslateBatchModal :state="batchState" :is-processing="isBatchProcessing"
            :is-stopping="isStopping" @stop="stopProcessing" @close="closeBatchModal" />
    </div>
</template>
