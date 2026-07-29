<script setup lang="ts">
const { showToast } = useToast()
const { detectionModule, checkStatus, updateProgress } = useDetectionModuleStatus()

const showDeleteConfirm = ref(false)
const isDeleting = ref(false)
let cleanupProgress: (() => void) | null = null

const statusLabel = computed(() => ({
    checking: '检查中',
    not_installed: '未安装',
    downloading: '下载中',
    installed: '已安装',
    unavailable: '发布待配置',
    error: '状态异常'
}[detectionModule.status]))

const statusClass = computed(() => ({
    checking: 'bg-manga-100 text-manga-600 dark:bg-manga-700 dark:text-manga-300',
    not_installed: 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300',
    downloading: 'bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300',
    installed: 'bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-300',
    unavailable: 'bg-manga-100 text-manga-500 dark:bg-manga-700 dark:text-manga-400',
    error: 'bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-300'
}[detectionModule.status]))

const downloadLabel = computed(() => {
    if (detectionModule.stage === 'verifying') return '正在校验模块'
    if (detectionModule.stage === 'installing') return '正在安装模块'
    return '正在下载模块'
})

const handleDownload = async () => {
    if (!window.electronAPI?.downloadDetectionModule) {
        showToast('检测模块需要在桌面应用中下载')
        return
    }
    if (detectionModule.status === 'downloading') return

    detectionModule.status = 'downloading'
    detectionModule.progress = 0
    detectionModule.error = ''
    try {
        const result = await window.electronAPI.downloadDetectionModule()
        if (!result.success) throw new Error(result.error || '模块下载失败')
        await checkStatus()
    } catch (error) {
        detectionModule.status = 'error'
        detectionModule.error = error instanceof Error ? error.message : String(error)
        showToast(`下载失败：${detectionModule.error}`)
    }
}

const handleDelete = async () => {
    if (!window.electronAPI?.deleteDetectionModule) return
    isDeleting.value = true
    try {
        const result = await window.electronAPI.deleteDetectionModule()
        if (!result.success) throw new Error(result.error || '删除失败')
        showDeleteConfirm.value = false
        await checkStatus()
    } catch (error) {
        showToast(error instanceof Error ? error.message : String(error))
    } finally {
        isDeleting.value = false
    }
}

const openModuleFolder = () => {
    if (!window.electronAPI?.openDetectionModuleFolder) {
        showToast('检测模块目录将在后端接入后开放')
        return
    }
    window.electronAPI.openDetectionModuleFolder()
}

onMounted(() => {
    checkStatus()
    if (window.electronAPI?.onDetectionModuleDownloadProgress) {
        cleanupProgress = window.electronAPI.onDetectionModuleDownloadProgress(updateProgress)
    }
})

onUnmounted(() => cleanupProgress?.())
</script>

<template>
    <div class="space-y-6 animate-fade-in flex flex-col h-full">
        <div>
            <div class="flex items-center gap-2 text-manga-900 dark:text-white">
                <IconAutoDetect class="size-6 text-primary" />
                <h3 class="text-lg font-bold">自动检测模块</h3>
            </div>
            <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">
                下载并管理自动文字区域检测能力
            </p>
        </div>

        <section class="bg-white dark:bg-manga-900 border border-manga-200 dark:border-manga-700 rounded-xl p-5 shadow-sm">
            <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="font-bold text-manga-900 dark:text-white">{{ detectionModule.name }}</h4>
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold" :class="statusClass">
                            {{ statusLabel }}
                        </span>
                        <span v-if="detectionModule.version"
                            class="px-2 py-0.5 rounded text-[10px] bg-manga-100 dark:bg-manga-800 text-manga-500">
                            v{{ detectionModule.version }}
                        </span>
                    </div>
                    <p class="text-sm text-manga-500 dark:text-manga-400 mt-2 leading-relaxed">
                        {{ detectionModule.description }}
                    </p>
                </div>
                <IconAutoDetect class="size-10 shrink-0 text-primary/70" />
            </div>

            <div class="grid grid-cols-2 gap-3 mt-5">
                <div class="rounded-lg bg-manga-50 dark:bg-manga-800 p-3">
                    <div class="text-[11px] text-manga-400">下载大小</div>
                    <div class="text-sm font-bold text-manga-800 dark:text-manga-200 mt-1">{{ detectionModule.downloadSize }}</div>
                </div>
                <div class="rounded-lg bg-manga-50 dark:bg-manga-800 p-3">
                    <div class="text-[11px] text-manga-400">安装后占用</div>
                    <div class="text-sm font-bold text-manga-800 dark:text-manga-200 mt-1">{{ detectionModule.installedSize }}</div>
                </div>
            </div>

            <div v-if="detectionModule.status === 'downloading'" class="mt-5">
                <div class="flex justify-between text-xs text-manga-500 mb-2">
                    <span>{{ downloadLabel }}</span>
                    <span class="tabular-nums">{{ Math.round(detectionModule.progress) }}%</span>
                </div>
                <div class="h-2 bg-manga-100 dark:bg-manga-700 rounded-full overflow-hidden">
                    <div class="h-full bg-primary rounded-full transition-all duration-300"
                        :style="{ width: `${detectionModule.progress}%` }" />
                </div>
            </div>

            <p v-if="detectionModule.error" class="text-xs mt-4"
                :class="detectionModule.status === 'unavailable' ? 'text-manga-500' : 'text-red-500'">
                {{ detectionModule.error }}
            </p>

            <div class="flex gap-3 mt-5">
                <button v-if="detectionModule.status === 'installed'" type="button"
                    class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-manga-200 dark:border-manga-600 text-sm font-medium text-manga-700 dark:text-manga-200 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                    @click="openModuleFolder">
                    <IconFolder class="size-4" />
                    打开模块目录
                </button>
                <button v-if="detectionModule.status === 'installed'" type="button"
                    class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-800 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                    @click="showDeleteConfirm = true">
                    <IconTresh class="size-4" />
                    删除
                </button>
                <button v-else type="button"
                    :disabled="detectionModule.status === 'checking' || detectionModule.status === 'downloading' || detectionModule.status === 'unavailable'"
                    class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-bold transition-all enabled:hover:opacity-90 enabled:hover:-translate-y-px disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                    @click="handleDownload">
                    <IconDownload class="size-4" />
                    {{ detectionModule.status === 'downloading' ? downloadLabel : '下载并安装模块' }}
                </button>
            </div>
        </section>

        <div class="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 p-4">
            <div class="flex items-start gap-3">
                <IconInfo class="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                    <h4 class="text-sm font-bold text-manga-900 dark:text-blue-100">按需安装</h4>
                    <p class="text-xs text-manga-500 dark:text-blue-200/70 mt-1 leading-relaxed">
                        模块包含检测代码、CTD 模型、OpenCV 运行时、配置和许可证，并复用应用已有的 PyTorch。未安装时不会影响手动画框、OCR 或翻译。
                    </p>
                </div>
            </div>
        </div>

        <ConfirmModal :show="showDeleteConfirm" title="删除自动检测模块？"
            :content="`删除后将释放 ${detectionModule.installedSize}，手动 OCR 与翻译仍可正常使用。`"
            confirm-text="确认删除" :is-danger="true" :loading="isDeleting"
            @cancel="showDeleteConfirm = false" @confirm="handleDelete" />
    </div>
</template>
