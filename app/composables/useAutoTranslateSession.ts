import type { OcrBlock } from '~/types/interface'
import type { AutoTranslateBatchState, AutoTranslatePageState } from '~/composables/useAutoTranslateProcessing'

const createBatchState = (): AutoTranslateBatchState => ({
    show: false,
    status: 'idle',
    stage: 'idle',
    pageIndex: 0,
    pageTotal: 0,
    regionIndex: 0,
    regionTotal: 0,
    progress: 0,
    message: '等待开始处理',
    pageLabel: '',
    completedPages: 0,
    failedPages: 0,
    skippedPages: 0
})

export const useAutoTranslateSession = () => {
    const allPageBlocks = useState<Record<string, OcrBlock[]>>('auto-translate-page-blocks', () => ({}))
    const pageStates = useState<Record<string, AutoTranslatePageState>>('auto-translate-page-states', () => ({}))
    const processedPageIds = useState<Record<string, true>>('auto-translate-processed-pages', () => ({}))
    const batchState = useState<AutoTranslateBatchState>('auto-translate-batch-state', createBatchState)
    const isPreparing = useState('auto-translate-preparing', () => false)
    const isCurrentPageProcessing = useState('auto-translate-current-processing', () => false)
    const isBatchProcessing = useState('auto-translate-batch-processing', () => false)
    const isStopping = useState('auto-translate-stopping', () => false)
    const bookId = useState<string | null>('auto-translate-book-id', () => null)
    const isProcessing = computed(() => isPreparing.value || isCurrentPageProcessing.value || isBatchProcessing.value)

    const resetSession = () => {
        allPageBlocks.value = {}
        pageStates.value = {}
        processedPageIds.value = {}
        batchState.value = createBatchState()
        isPreparing.value = false
        isCurrentPageProcessing.value = false
        isBatchProcessing.value = false
        isStopping.value = false
        bookId.value = null
    }

    return {
        allPageBlocks,
        pageStates,
        processedPageIds,
        batchState,
        isPreparing,
        isCurrentPageProcessing,
        isBatchProcessing,
        isStopping,
        isProcessing,
        bookId,
        resetSession
    }
}
