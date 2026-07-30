<script setup lang="ts">
import type { Book, ImageItem, OcrBlock } from '~/types/interface'

const router = useRouter()
const route = useRoute()
const { images, currentImageIndex, clearImages, tempBookPath, addImagesToStore, setImage } = useMangaImages()
const { initSettings, settings } = useSettings()
const { loadBookImages } = useBookSource()
const autoTranslateSession = useAutoTranslateSession()

const showSettingsModal = ref(false)
const activeBlockId = ref<string>()
const ocrBlocks = ref<OcrBlock[]>([])
const allPageBlocks = autoTranslateSession.allPageBlocks
const currentImageId = computed(() => images.value[currentImageIndex.value]?.id)
const isAddingToLibrary = ref(false)
const preserveSessionOnUnmount = ref(false)
const isRestoringBook = ref(false)
const splitPaneConfig = {
    defaultLeftPercent: 60,
    minLeftPercent: 50,
    maxLeftPercent: 80
} as const

const getSourceName = (sourcePath: string) => sourcePath.split(/[\\/]/).filter(Boolean).pop() || sourcePath

const restorePersistedPageState = (book: Book, sourceImages: ImageItem[]) => {
    Object.entries(book.autoTranslatePages || {}).forEach(([pageIndex, blocks]) => {
        const image = sourceImages[Number(pageIndex)]
        if (!image || !blocks.length || allPageBlocks.value[image.id]?.length) return
        allPageBlocks.value[image.id] = blocks
    })
    Object.entries(book.autoTranslateDeletedRegions || {}).forEach(([pageIndex, regions]) => {
        const image = sourceImages[Number(pageIndex)]
        if (!image || !regions.length) return
        const localRegions = autoTranslateSession.deletedPageRegions.value[image.id] || []
        autoTranslateSession.deletedPageRegions.value[image.id] = [
            ...regions,
            ...localRegions.filter(local => !regions.some(region => (
                region.x === local.x
                && region.y === local.y
                && region.width === local.width
                && region.height === local.height
            )))
        ]
    })

    const persistedProcessedPages = book.autoTranslateProcessedPages
        || Object.keys(book.autoTranslatePages || {}).map(Number)
    persistedProcessedPages.forEach((pageIndex) => {
        const image = sourceImages[pageIndex]
        if (image) autoTranslateSession.processedPageIds.value[image.id] = true
    })
}

const nextPageRevision = (imageId: string) => {
    const previous = autoTranslateSession.pageSaveRevisions.value[imageId] || 0
    const revision = Math.max(Date.now() * 1000, previous + 1)
    autoTranslateSession.pageSaveRevisions.value[imageId] = revision
    return revision
}

const snapshotBlocks = (blocks: OcrBlock[]): OcrBlock[] => blocks.map(block => ({
    id: block.id,
    ...(block.source ? { source: block.source } : {}),
    rect: {
        x: block.rect.x,
        y: block.rect.y,
        width: block.rect.width,
        height: block.rect.height
    },
    original: block.original,
    translation: block.translation,
    tokens: (block.tokens || []).map(token => ({ ...token })),
    status: block.status,
    showOriginal: block.showOriginal
}))

const persistPageBlocks = async (imageId: string, blocks: OcrBlock[]) => {
    if (isRestoringBook.value) return
    const bookId = autoTranslateSession.bookId.value
    const pageIndex = images.value.findIndex(image => image.id === imageId)
    if (!bookId || pageIndex < 0) return
    await window.electronAPI.updateAutoTranslatePage({
        id: bookId,
        pageIndex,
        blocks: snapshotBlocks(blocks),
        deletedRegions: (autoTranslateSession.deletedPageRegions.value[imageId] || []).map(region => ({
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height
        })),
        processed: Boolean(autoTranslateSession.processedPageIds.value[imageId]),
        revision: nextPageRevision(imageId)
    })
}

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
} = useAutoTranslateProcessing({
    currentImageId,
    images,
    ocrBlocks,
    allPageBlocks,
    activeBlockId,
    persistPageBlocks
})

watch(currentImageId, (newId, oldId) => {
    if (oldId) allPageBlocks.value[oldId] = [...ocrBlocks.value]
    ocrBlocks.value = newId && allPageBlocks.value[newId] ? [...allPageBlocks.value[newId]!] : []
    activeBlockId.value = undefined
    isOcrMode.value = false
}, { immediate: true })

watch(ocrBlocks, (blocks) => {
    if (currentImageId.value) {
        allPageBlocks.value[currentImageId.value] = blocks
        persistPageBlocks(currentImageId.value, blocks).catch(error => {
            console.error('[AutoTranslate] failed to persist edited blocks', error)
        })
    }
}, { deep: true })

const handleSelectBlock = (id: string) => {
    activeBlockId.value = id
}

const handleDeleteBlock = (id: string) => {
    const deletedBlock = ocrBlocks.value.find(block => block.id === id)
    if (!deletedBlock) return
    const imageId = currentImageId.value
    if (imageId) {
        const deletedRegions = autoTranslateSession.deletedPageRegions.value[imageId] || []
        if (!deletedRegions.some(region => (
            region.x === deletedBlock.rect.x
            && region.y === deletedBlock.rect.y
            && region.width === deletedBlock.rect.width
            && region.height === deletedBlock.rect.height
        ))) {
            autoTranslateSession.deletedPageRegions.value[imageId] = [
                ...deletedRegions,
                { ...deletedBlock.rect }
            ]
        }
    }
    ocrBlocks.value = ocrBlocks.value.filter(block => block.id !== id)
    if (activeBlockId.value === id) activeBlockId.value = ocrBlocks.value[0]?.id
    if (imageId && !ocrBlocks.value.some(block => block.status === 'done' && block.original && block.translation)) {
        unmarkPageProcessed(imageId)
    }
    if (imageId) {
        persistPageBlocks(imageId, ocrBlocks.value).catch(error => {
            console.error('[AutoTranslate] failed to persist deleted block', error)
        })
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
    preserveSessionOnUnmount.value = isProcessing.value
    if (!preserveSessionOnUnmount.value) {
        clearImages()
        autoTranslateSession.resetSession()
    }
    router.push('/')
}

const ensureAddedToLibrary = async () => {
    if (!tempBookPath.value || !images.value.length || autoTranslateSession.bookId.value || isAddingToLibrary.value) return
    isAddingToLibrary.value = true
    try {
        const result = await window.electronAPI.addBook(tempBookPath.value, 'auto-translate')
        if (!result.success || !result.book) throw new Error(result.error || '加入书架失败')
        autoTranslateSession.bookId.value = result.book.id
        restorePersistedPageState(result.book, images.value)
        const activeImageId = currentImageId.value
        if (activeImageId && allPageBlocks.value[activeImageId]?.length) {
            ocrBlocks.value = [...allPageBlocks.value[activeImageId]!]
        }
        await Promise.all(images.value.map((image) => {
            const blocks = allPageBlocks.value[image.id] || []
            const deletedRegions = autoTranslateSession.deletedPageRegions.value[image.id] || []
            const processed = Boolean(autoTranslateSession.processedPageIds.value[image.id])
            if (!blocks.length && !deletedRegions.length && !processed) return Promise.resolve(false)
            return persistPageBlocks(image.id, blocks)
        }))
        await window.electronAPI.updateBookProgress({
            id: result.book.id,
            totalPage: images.value.length,
            currentPage: currentImageIndex.value,
            lastReadTime: Date.now()
        })
        if (!result.alreadyExists) console.log('[AutoTranslate] imported source added to library', tempBookPath.value)
    } catch (error) {
        console.error('[AutoTranslate] failed to add imported source to library', error)
    } finally {
        isAddingToLibrary.value = false
    }
}

watch(tempBookPath, (path, previousPath) => {
    if (previousPath && path !== previousPath) autoTranslateSession.bookId.value = null
    if (path) autoTranslateSession.taskContext.value.bookName = getSourceName(path)
})

watch([tempBookPath, () => images.value.length], ensureAddedToLibrary)

watch(currentImageIndex, (index) => {
    if (!autoTranslateSession.bookId.value) return
    window.electronAPI.updateBookProgress({
        id: autoTranslateSession.bookId.value,
        currentPage: index,
        totalPage: images.value.length,
        lastReadTime: Date.now()
    })
})

const handleSettingsClose = async () => {
    showSettingsModal.value = false
    await checkTranslationReady()
}

const loadLibraryBook = async () => {
    const bookId = typeof route.query.id === 'string' ? route.query.id : ''
    const sourcePath = typeof route.query.path === 'string' ? route.query.path : ''
    if (!bookId || !sourcePath) return
    if (autoTranslateSession.bookId.value === bookId && images.value.length) return

    isRestoringBook.value = true
    try {
        clearImages()
        autoTranslateSession.resetSession()
        autoTranslateSession.bookId.value = bookId
        autoTranslateSession.taskContext.value.bookName = getSourceName(sourcePath)
        tempBookPath.value = sourcePath

        const library = await window.electronAPI.getLibrary()
        const book = library.find(item => item.id === bookId)
        const loadedImages = await loadBookImages(sourcePath)
        addImagesToStore(loadedImages)

        if (book) restorePersistedPageState(book, loadedImages)

        if (loadedImages.length) {
            const requestedPage = Number(route.query.current || book?.currentPage || 0)
            setImage(Math.min(Math.max(0, requestedPage), loadedImages.length - 1))
            const imageId = images.value[currentImageIndex.value]?.id
            ocrBlocks.value = imageId ? [...(allPageBlocks.value[imageId] || [])] : []
        }
        console.log('[AutoTranslate] loaded auto-translate book from library', { bookId, pages: loadedImages.length })
    } finally {
        isRestoringBook.value = false
    }
}

onMounted(async () => {
    try {
        await loadLibraryBook()
        await initSettings()
        await checkTranslationReady()
    } catch (error) {
        console.error('[AutoTranslate] failed to open library book', error)
    }
})
onUnmounted(() => {
    if (!preserveSessionOnUnmount.value && !isProcessing.value) {
        clearImages()
        autoTranslateSession.resetSession()
    }
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
