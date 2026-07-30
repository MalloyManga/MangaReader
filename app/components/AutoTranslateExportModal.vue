<script setup lang="ts">
import type { Book } from '~/types/interface'
import type { ExportScope } from '~/composables/useTranslatedImageExport'

const props = defineProps<{
    show: boolean
    book: Book | null
}>()

const emit = defineEmits<{
    close: []
}>()

const { showToast } = useToast()
const { exportBook, getExportablePageIndices } = useTranslatedImageExport()
const scope = ref<ExportScope>('all')
const isExporting = ref(false)
const progress = ref(0)
const progressMessage = ref('')

const bookName = computed(() => props.book?.path.split(/[\\/]/).filter(Boolean).pop() || '')
const currentAvailable = computed(() => props.book ? getExportablePageIndices(props.book, 'current').length : 0)
const allAvailable = computed(() => props.book ? getExportablePageIndices(props.book, 'all').length : 0)

watch(() => props.show, (show) => {
    if (!show) return
    scope.value = 'all'
    progress.value = 0
    progressMessage.value = ''
})

const close = () => {
    if (!isExporting.value) emit('close')
}

const startExport = async () => {
    if (!props.book || isExporting.value) return
    isExporting.value = true
    progress.value = 0
    progressMessage.value = '正在准备导出'
    try {
        const result = await exportBook(props.book, scope.value, (current, total, message) => {
            progress.value = Math.round((current / Math.max(1, total)) * 100)
            progressMessage.value = message
        })
        if (result.canceled) {
            progress.value = 0
            progressMessage.value = ''
            return
        }
        progress.value = 100
        progressMessage.value = `已导出 ${result.exported} 页`
        showToast(`已导出 ${result.exported} 张翻译图片`, 3000)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        progressMessage.value = message
        showToast(message, 5000)
        console.error('[AutoTranslateExport] export failed', error)
    } finally {
        isExporting.value = false
    }
}
</script>

<template>
    <Teleport to="body">
        <Transition enter-active-class="transition duration-200 ease-out" leave-active-class="transition duration-150 ease-in"
            enter-from-class="opacity-0" leave-to-class="opacity-0">
            <div v-if="show && book" class="fixed inset-0 z-60 flex items-center justify-center bg-black/55 p-4"
                @click.self="close">
                <section class="w-full max-w-md rounded-lg border border-manga-200 bg-white p-6 shadow-2xl dark:border-manga-600 dark:bg-manga-800">
                    <div class="flex items-start gap-3">
                        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <IconDownload class="size-5" />
                        </div>
                        <div class="min-w-0 flex-1">
                            <h2 class="text-lg font-bold text-manga-900 dark:text-manga-100">导出翻译图片</h2>
                            <p class="mt-1 truncate text-sm text-manga-500 dark:text-manga-400" :title="bookName">{{ bookName }}</p>
                        </div>
                        <button type="button" class="flex size-8 items-center justify-center text-manga-500 hover:text-manga-900 disabled:opacity-40 dark:hover:text-white"
                            :disabled="isExporting" title="关闭" @click="close">
                            <IconClose class="size-4" />
                        </button>
                    </div>

                    <div class="mt-6 grid grid-cols-2 rounded-lg bg-manga-100 p-1 dark:bg-manga-700">
                        <button type="button" class="h-10 rounded-md text-sm font-medium transition-colors"
                            :class="scope === 'current' ? 'bg-white text-primary shadow-sm dark:bg-manga-800' : 'text-manga-500'"
                            @click="scope = 'current'">
                            当前页（{{ currentAvailable }}）
                        </button>
                        <button type="button" class="h-10 rounded-md text-sm font-medium transition-colors"
                            :class="scope === 'all' ? 'bg-white text-primary shadow-sm dark:bg-manga-800' : 'text-manga-500'"
                            @click="scope = 'all'">
                            全部页面（{{ allAvailable }}）
                        </button>
                    </div>

                    <div v-if="progressMessage" class="mt-5">
                        <div class="flex items-center justify-between gap-3 text-xs text-manga-500">
                            <span class="truncate">{{ progressMessage }}</span>
                            <span class="shrink-0 tabular-nums">{{ progress }}%</span>
                        </div>
                        <div class="mt-2 h-2 overflow-hidden rounded-full bg-manga-100 dark:bg-manga-700">
                            <div class="h-full rounded-full bg-primary transition-all duration-200" :style="{ width: `${progress}%` }" />
                        </div>
                    </div>

                    <div class="mt-6 flex justify-end gap-3">
                        <button type="button" class="h-10 px-4 text-sm font-medium text-manga-600 disabled:opacity-40 dark:text-manga-300"
                            :disabled="isExporting" @click="close">取消</button>
                        <button type="button" class="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            :disabled="isExporting || (scope === 'current' ? !currentAvailable : !allAvailable)" @click="startExport">
                            <IconDownload class="size-4" />
                            {{ isExporting ? '正在导出' : '选择文件夹并导出' }}
                        </button>
                    </div>
                </section>
            </div>
        </Transition>
    </Teleport>
</template>
