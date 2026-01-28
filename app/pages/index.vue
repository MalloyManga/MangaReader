<script setup lang="ts">
import type { Book } from '~/types/interface'

const library = ref<Book[]>([])
const loading = ref(true)
const showSettingsModal = ref(false)
const { initSettings } = useSettings()
const { showToast } = useToast()

// Deleting state for animation
const deletingIds = ref<Set<string>>(new Set())

const loadLibrary = async () => {
    loading.value = true
    if (import.meta.client && window.electronAPI) {
        const libs = await window.electronAPI.getLibrary()
        // Sort by lastReadTime descending (Newest first)
        library.value = libs.sort((a, b) => b.lastReadTime - a.lastReadTime)
    }
    loading.value = false
}

const handleAddBook = () => {
    showToast('💡 提示：选中任意一张图片，即可导入整个文件夹', 2500)
    navigateTo('/reader')
}

const openBook = async (book: Book) => {
    // Check if file exists
    if (window.electronAPI) {
        // [Fix] Check if file exists before opening
        const exists = await window.electronAPI.checkFileExists(book.path)
        if (!exists) {
            // [UX] If file is missing, warn user but let them decide to remove
            if (confirm('源文件不存在，是否从书架移除？')) {
                await window.electronAPI.removeBook(book.id)
                loadLibrary()
            }
            return
        }
    }

    navigateTo({
        path: '/reader', query: {
            path: book.path,
            id: book.id,
            current: book.currentPage.toString() // Pass current page
        }
    })
}

const removeBook = async (e: Event, id: string) => {
    e.stopPropagation()
    // Animation Only - No Confirm Dialog
    if (deletingIds.value.has(id)) return // Prevent double click

    deletingIds.value.add(id)

    // Wait for animation (300ms matches the transition duration)
    setTimeout(async () => {
        await window.electronAPI?.removeBook(id)
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
                <!-- Book Card -->
                <div v-for="book in library" :key="book.id" :class="{ 'scale-0 opacity-0': deletingIds.has(book.id) }"
                    class="group relative bg-white dark:bg-manga-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 transform cursor-pointer overflow-hidden border border-manga-200 dark:border-manga-700 hover:border-primary"
                    @click="openBook(book)">

                    <!-- Cover -->
                    <div class="aspect-2/3 relative bg-gray-100 dark:bg-gray-800">
                        <img v-if="book.cover" :src="book.cover" class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                            <span class="text-4xl">📄</span>
                            <span class="text-xs">无封面</span>
                        </div>

                        <!-- Progress Bar -->
                        <div v-if="book.totalPage > 0"
                            class="absolute bottom-0 left-0 w-full h-1 bg-gray-700/30 backdrop-blur-sm">
                            <div class="h-full bg-primary transition-all duration-300"
                                :style="{ width: `${Math.min(((book.currentPage + 1) / book.totalPage) * 100, 100)}%` }">
                            </div>
                        </div>

                        <!-- Delete Button -->
                        <button @click="(e) => removeBook(e, book.id)"
                            class="absolute top-2 right-2 p-1.5 bg-red-500/90 hover:bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 cursor-pointer">
                            <IconTresh class="size-4" />
                        </button>
                    </div>

                    <!-- Info -->
                    <div class="p-3">
                        <div class="text-xs font-medium text-gray-700 dark:text-gray-300 overflow-hidden text-ellipsis whitespace-nowrap mb-1"
                            :title="book.path">
                            {{ book.path.split(/[\\/]/).pop() }}
                        </div>
                        <div class="text-[10px] text-gray-400 flex justify-between">
                            <span>{{ new Date(book.lastReadTime).toLocaleDateString() }}</span>
                        </div>
                    </div>
                </div>

                <!-- Add Button -->
                <div @click="handleAddBook"
                    class="aspect-2/3 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary hover:text-primary dark:hover:border-primary cursor-pointer text-gray-400 transition-colors group">
                    <div
                        class="size-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                        <IconAdd class="size-6 text-gray-500 group-hover:text-primary transition-colors" />
                    </div>
                    <div class="text-xs font-medium">导入新书</div>
                </div>
            </div>
        </div>
        <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
    </div>
</template>
