<script setup lang="ts">
import type { Book } from '~/types/interface'
const { initSettings } = useSettings()
const { showToast } = useToast()
const autoTranslateSession = useAutoTranslateSession()

const library = ref<Book[]>([])
const loading = ref(true)
const showSettingsModal = ref(false)
const deletingIds = ref<Set<string>>(new Set())
const confirmModalFlag = ref<boolean>(false)
const deleteBookId = ref<string>('')
const exportBook = ref<Book | null>(null)

const handleModalConfirm = async () => {
    await window.electronAPI.removeBook(deleteBookId.value)
    loadLibrary()
    confirmModalFlag.value = false
    deleteBookId.value = ''
}
const handleModalCancel = () => {
    confirmModalFlag.value = false
}

const loadLibrary = async () => {
    loading.value = true
    if (import.meta.client && window.electronAPI) {
        const books = await window.electronAPI.getLibrary()
        library.value = books.sort((a, b) => b.lastReadTime - a.lastReadTime) // 书籍排序 最近阅读的放在最前面
    }
    loading.value = false
}

const handleAddBook = () => {
    showToast('💡 提示：选中任意一张图片，即可导入整个文件夹', 2500)
    navigateTo('/reader')
}

const openAutoTranslate = () => {
    navigateTo('/auto-translate')
}

const openBook = async (book: Book) => {
    if (window.electronAPI) {
        const exists = await window.electronAPI.checkFileExists(book.path)
        if (!exists) {
            deleteBookId.value = book.id
            confirmModalFlag.value = true
            return
        }
    }

    const isAutoTranslateBook = book.kind === 'auto-translate'
    if (isAutoTranslateBook && autoTranslateSession.isProcessing.value
        && autoTranslateSession.bookId.value !== book.id) {
        showToast('请先停止当前正在运行的自动识别任务', 4000)
        return
    }

    navigateTo({
        path: isAutoTranslateBook ? '/auto-translate' : '/reader',
        query: {
            id: book.id,
            path: book.path,
            current: book.currentPage.toString()
        }
    })
}

const openExportModal = async (event: Event, book: Book) => {
    event.stopPropagation()
    const latestLibrary = await window.electronAPI.getLibrary()
    exportBook.value = latestLibrary.find(item => item.id === book.id) || book
}

const removeBook = async (e: Event, id: string) => {
    e.stopPropagation()
    if (deletingIds.value.has(id)) return

    deletingIds.value.add(id)

    setTimeout(async () => {
        await window.electronAPI.removeBook(id)
        loadLibrary()
        deletingIds.value.delete(id)
    }, 300)
}

onMounted(() => {
    initSettings()
    loadLibrary()
})
</script>

<template>
    <div class="min-h-screen bg-manga-50 dark:bg-manga-900 flex flex-col">
        <TitleBar @open-settings="showSettingsModal = true" />
        <ToastContainer />
        <div class="max-w-7xl mx-auto w-full flex-1 p-6">
            <h1 class="text-2xl font-bold mb-6 text-manga-900 dark:text-gray-100 flex items-center gap-2">
                <span>📚</span> 我的书架
            </h1>

            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                <!-- 书籍卡片 -->
                <div v-for="book in library" :key="book.id" :class="{ 'scale-0 opacity-0': deletingIds.has(book.id) }"
                    class="group relative bg-white dark:bg-manga-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 transform cursor-pointer overflow-hidden border border-manga-200 dark:border-manga-700 hover:border-primary"
                    @click="openBook(book)">

                    <!-- 封面缩略图 -->
                    <div class="aspect-2/3 relative bg-gray-100 dark:bg-gray-800">
                        <img v-if="book.cover" :src="book.cover" class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                            <span class="text-4xl">📄</span>
                            <span class="text-xs">无封面</span>
                        </div>

                        <!-- 阅读进度条 -->
                        <div v-if="book.totalPage > 0"
                            class="absolute bottom-0 left-0 w-full h-1 bg-gray-700/30 backdrop-blur-sm">
                            <div class="h-full bg-primary transition-all duration-300"
                                :style="{ width: `${Math.min(((book.currentPage + 1) / book.totalPage) * 100, 100)}%` }">
                            </div>
                        </div>

                        <!-- 删除按钮 -->
                        <button @click="(e) => removeBook(e, book.id)"
                            class="absolute top-2 right-2 p-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 cursor-pointer">
                            <IconTresh class="size-4" />
                        </button>

                        <button v-if="book.kind === 'auto-translate'" type="button" title="导出翻译图片"
                            class="absolute top-2 right-11 z-10 flex size-7 items-center justify-center rounded bg-white/90 text-manga-600 opacity-0 shadow-sm transition-all hover:bg-primary hover:text-white group-hover:opacity-100 dark:bg-manga-800/90 dark:text-manga-300"
                            @click="openExportModal($event, book)">
                            <IconDownload class="size-4" />
                        </button>

                        <div v-if="book.kind === 'auto-translate'"
                            class="absolute bottom-3 left-2 flex items-center gap-1 rounded bg-black/65 px-2 py-1 text-[10px] font-medium text-white">
                            <IconAutoDetect class="size-3" />
                            自动检测
                        </div>
                    </div>

                    <!-- 信息 -->
                    <div class="p-3">
                        <div class="text-xs font-medium text-gray-700 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap mb-1"
                            :title="book.path">
                            {{ book.path.split(/[\\/]/).pop() }}
                        </div>
                        <div class="text-[10px] text-gray-400 flex justify-between">
                            <span>
                                {{ new Date(book.lastReadTime).toLocaleDateString() }}
                            </span>
                        </div>
                    </div>
                </div>

                <div @click="handleAddBook"
                    class="aspect-2/3 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary hover:text-primary dark:hover:border-primary cursor-pointer text-gray-400 transition-colors group">
                    <div
                        class="size-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                        <IconAdd class="size-6 text-gray-500 group-hover:text-primary transition-colors" />
                    </div>
                    <div class="text-xs font-medium">导入新书</div>
                </div>

                <div @click="openAutoTranslate"
                    class="aspect-2/3 flex flex-col items-center justify-center border-2 border-dashed border-manga-300 dark:border-manga-600 rounded-lg hover:border-primary hover:text-primary dark:hover:border-primary cursor-pointer text-manga-500 transition-colors group bg-white/40 dark:bg-manga-800/30">
                    <div
                        class="size-12 rounded-full bg-manga-100 dark:bg-manga-800 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                        <IconAutoDetect class="size-7 text-manga-500 group-hover:text-primary transition-colors" />
                    </div>
                    <div class="text-xs font-medium">自动识别翻译</div>
                    <div class="text-[10px] mt-1 text-manga-400">检测整页文字区域</div>
                </div>

            </div>
        </div>
        <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
        <AutoTranslateExportModal :show="Boolean(exportBook)" :book="exportBook" @close="exportBook = null" />
    </div>
    <ConfirmModal @confirm="handleModalConfirm" @cancel="handleModalCancel" :show="confirmModalFlag" title="文件丢失"
        content="这本书的原文件似乎被移动或删除了，是否将它从书架中移除？" />
</template>
