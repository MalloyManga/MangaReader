<!-- components/SettingsTranslate.vue -->
<script setup lang="ts">
const { openModelFolder } = useSettings()
const { showToast } = useToast()
const {
    models,
    selectedModel,
    setSelectedModel,
    checkAllModelStatus,
    updateDownloadingProgress
} = useModelStatus()

const deleteTarget = ref<any | null>(null)
const isDeleting = ref(false)
const isAnyModelDownloading = computed(() => models.some(item => item.status === 'downloading'))
let cleanupModelProgress: (() => void) | null = null

const handleDownload = async (model: any) => {
    if (model.status === 'downloading') return
    if (isAnyModelDownloading.value) {
        showToast('请等待当前模型下载完成后再下载其他模型')
        return
    }
    model.status = 'downloading'
    model.progress = 0

    try {
        const res = await window.electronAPI.downloadModel(model.id)

        if (res.success) {
            model.progress = 100
            model.status = 'downloaded'
            setSelectedModel(model.id)
        } else {
            showToast(`下载失败: ${res.error}`)
            model.status = 'not_downloaded'
        }
    } catch (e) {
        model.status = 'not_downloaded'
        showToast('下载出错')
    }
}

const handleUseModel = (model: any) => {
    if (model.status !== 'downloaded') {
        showToast('请先下载该翻译模型')
        return
    }
    setSelectedModel(model.id)
}

const confirmDelete = async () => {
    if (!deleteTarget.value) return
    if (isAnyModelDownloading.value) {
        showToast('请等待当前模型下载完成后再删除')
        deleteTarget.value = null
        return
    }
    isDeleting.value = true

    try {
        const target = deleteTarget.value
        const res = await window.electronAPI.deleteModel(target.id)
        if (res.success) {
            target.status = 'not_downloaded'
            target.progress = 0
            if (selectedModel.value?.id === target.id) {
                const fallback = models.find(item => item.id !== target.id && item.status === 'downloaded')
                if (fallback) {
                    setSelectedModel(fallback.id)
                }
            }
            deleteTarget.value = null
        } else {
            showToast('删除失败')
        }
    } catch (e) {
        showToast('删除出错')
    } finally {
        isDeleting.value = false
    }
}

const openLink = (url: string) => {
    window.electronAPI.openLink(url)
}

onMounted(() => {
    checkAllModelStatus()

    if (!window.electronAPI) {
        console.warn('SettingsTranslate: Electron API not available')
        return
    }

    cleanupModelProgress = window.electronAPI.onDownloadProgress((percent: number) => {
        updateDownloadingProgress(percent)
    })
})

onUnmounted(() => {
    cleanupModelProgress?.()
})
</script>

<template>
    <div class="space-y-6 animate-fade-in flex flex-col h-full">
        <div>
            <h3 class="text-lg font-bold text-manga-900 dark:text-white">
                翻译模型管理
            </h3>
            <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">
                选择并管理本地离线翻译模型
            </p>
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto pr-1">
            <div v-for="item in models" :key="item.id"
                class="bg-white dark:bg-manga-900 border rounded-lg p-5 shadow-sm transition-all hover:shadow-md"
                :class="selectedModel?.id === item.id
                    ? 'border-blue-300 dark:border-blue-700'
                    : 'border-manga-200 dark:border-manga-700 hover:border-manga-300'">

                <div class="flex justify-between items-center gap-4">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="font-bold text-manga-900 dark:text-white text-base">
                                {{ item.name }}
                            </h4>
                            <span
                                class="px-2 py-0.5 rounded text-[10px] font-bold bg-manga-100 dark:bg-manga-800 text-manga-600 dark:text-manga-400">
                                {{ item.size }}
                            </span>
                        </div>
                        <p class="text-sm text-manga-500 mt-1">
                            {{ item.description }}
                        </p>
                    </div>

                    <div class="flex items-center gap-3 shrink-0">
                        <div v-if="item.status === 'checking'" class="text-xs text-manga-400">
                            检查中...
                        </div>

                        <div v-else-if="item.status === 'downloaded'" class="flex items-center justify-end gap-2 min-w-28">
                            <button v-if="selectedModel?.id !== item.id" @click="handleUseModel(item)"
                                class="w-20 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer">
                                使用
                            </button>
                            <span v-else
                                class="w-20 text-center px-2 py-1.5 rounded text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                当前使用
                            </span>
                            <button @click="deleteTarget = item" title="删除模型"
                                :disabled="isAnyModelDownloading"
                                class="flex items-center justify-center w-8 h-8 text-manga-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-manga-400 disabled:hover:bg-transparent">
                                <IconTresh class="size-5" />
                            </button>
                        </div>

                        <div v-else-if="item.status === 'downloading'" class="w-32">
                            <div class="flex justify-between text-xs text-manga-500 mb-1">
                                <span>下载中...</span>
                                <span>{{ Math.round(item.progress) }}%</span>
                            </div>
                            <div class="w-full bg-manga-100 dark:bg-manga-700 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                    :style="{ width: item.progress + '%' }"></div>
                            </div>
                        </div>

                        <button v-else @click="handleDownload(item)" :disabled="isAnyModelDownloading"
                            class="flex items-center gap-2 px-4 py-2 bg-manga-900 dark:bg-manga-700 hover:bg-blue-600 dark:hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-all shadow-sm cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-manga-900 dark:disabled:hover:bg-manga-700">
                            <IconDownload class="size-4" />
                            下载
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="pt-5 border-t border-manga-100 dark:border-manga-700">
            <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800/50">
                <div class="flex items-start gap-3">
                    <div class="mt-0.5 text-blue-600 dark:text-blue-400">
                        <IconTip class="size-5" />
                    </div>
                    <div class="flex-1">
                        <h4 class="text-sm font-bold text-manga-900 dark:text-blue-100">
                            下载遇到问题？
                        </h4>
                        <p class="text-xs text-manga-500 dark:text-blue-200/70 mt-1 leading-relaxed">
                            自动下载失败时，可以打开模型文件夹检查本地文件。
                        </p>

                        <div class="flex gap-3 mt-3">
                            <button @click="openModelFolder"
                                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-manga-800 border border-blue-200 dark:border-blue-700 rounded text-manga-700 dark:text-blue-100 hover:text-blue-600 hover:border-blue-300 transition-colors cursor-pointer">
                                <IconFolder class="size-4" />
                                打开模型文件夹
                            </button>

                            <button type="button" title="参考教程"
                                @click="openLink('https://github.com/MalloyManga/MangaReader?tab=readme-ov-file#-%E4%BD%BF%E7%94%A8%E6%8C%87%E5%8D%97')"
                                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                                参考教程
                                <IconGithub class="text-black dark:text-white size-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <ConfirmModal :show="!!deleteTarget" title="删除模型文件？"
            :content="`确定要删除 ${deleteTarget?.name || ''} 吗？这将释放约 ${deleteTarget?.size || ''} 的磁盘空间。`"
            confirm-text="确认删除" :is-danger="true" :loading="isDeleting" @cancel="deleteTarget = null"
            @confirm="confirmDelete" />
    </div>
</template>
