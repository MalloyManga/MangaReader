<script setup lang="ts">
const { showToast } = useToast()
const { detectionModule, checkStatus, updateProgress } = useDetectionModuleStatus()

const showDeleteConfirm = ref(false)
const isDeleting = ref(false)
let cleanupProgress: (() => void) | null = null

const statusLabel = computed(() => ({
    checking: '检查中',
    not_installed: '未安装',
    downloading: '安装中',
    installed: '可用',
    corrupted: '需要修复',
    unavailable: '暂不可用',
    error: '状态异常'
}[detectionModule.status]))

const statusClass = computed(() => ({
    checking: 'bg-manga-100 text-manga-600 dark:bg-manga-700 dark:text-manga-300',
    not_installed: 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300',
    downloading: 'bg-blue-50 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300',
    installed: 'bg-green-50 text-green-700 dark:bg-green-900/25 dark:text-green-300',
    corrupted: 'bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-300',
    unavailable: 'bg-manga-100 text-manga-500 dark:bg-manga-700 dark:text-manga-400',
    error: 'bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-300'
}[detectionModule.status]))

const actionLabel = computed(() => detectionModule.status === 'corrupted'
    ? '修复并重新安装'
    : '一键下载并安装')

const handleDownload = async () => {
    if (!window.electronAPI?.downloadDetectionModule) {
        showToast('检测模块需要在桌面应用中下载')
        return
    }
    if (detectionModule.status === 'downloading') return

    detectionModule.status = 'downloading'
    detectionModule.progress = 0
    detectionModule.message = '正在连接官方下载源'
    detectionModule.error = ''
    try {
        const result = await window.electronAPI.downloadDetectionModule()
        if (!result.success) throw new Error(result.error || '模块安装失败')
        await checkStatus()
        showToast('自动检测模块安装完成')
    } catch (error) {
        detectionModule.status = 'error'
        detectionModule.error = error instanceof Error ? error.message : String(error)
        detectionModule.message = '安装失败，可以重新尝试'
        showToast(`安装失败：${detectionModule.error}`)
    }
}

const handleDelete = async () => {
    if (!window.electronAPI?.deleteDetectionModule) return
    isDeleting.value = true
    try {
        const result = await window.electronAPI.deleteDetectionModule()
        if (!result.success) throw new Error(result.error || '卸载失败')
        showDeleteConfirm.value = false
        await checkStatus()
        showToast('自动检测模块已卸载')
    } catch (error) {
        showToast(error instanceof Error ? error.message : String(error))
    } finally {
        isDeleting.value = false
    }
}

const openModuleFolder = () => window.electronAPI?.openDetectionModuleFolder?.()

onMounted(() => {
    checkStatus()
    if (window.electronAPI?.onDetectionModuleDownloadProgress) {
        cleanupProgress = window.electronAPI.onDetectionModuleDownloadProgress(updateProgress)
    }
})

onUnmounted(() => cleanupProgress?.())
</script>

<template>
    <div class="space-y-5 animate-fade-in flex flex-col h-full">
        <header>
            <div class="flex items-center gap-2 text-manga-900 dark:text-white">
                <IconAutoDetect class="size-6 text-primary" />
                <h3 class="text-lg font-bold">自动检测</h3>
            </div>
            <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">管理漫画文字区域检测组件</p>
        </header>

        <section class="bg-white dark:bg-manga-900 border border-manga-200 dark:border-manga-700 rounded-lg shadow-sm overflow-hidden">
            <div class="p-5">
                <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="font-bold text-manga-900 dark:text-white">{{ detectionModule.name }}</h4>
                            <span class="px-2 py-0.5 rounded text-[11px] font-bold" :class="statusClass">
                                {{ statusLabel }}
                            </span>
                            <span v-if="detectionModule.version" class="text-xs text-manga-400">
                                v{{ detectionModule.version }}
                            </span>
                        </div>
                        <p class="text-sm text-manga-500 dark:text-manga-400 mt-2 leading-relaxed">
                            {{ detectionModule.description }}
                        </p>
                    </div>
                    <IconAutoDetect class="size-9 shrink-0 text-primary" />
                </div>

                <dl class="mt-5 divide-y divide-manga-100 dark:divide-manga-700 border-y border-manga-100 dark:border-manga-700">
                    <div class="py-3 flex items-center justify-between gap-4 text-sm">
                        <dt class="text-manga-500 dark:text-manga-400">下载大小</dt>
                        <dd class="font-medium text-manga-800 dark:text-manga-200">{{ detectionModule.downloadSize }}</dd>
                    </div>
                    <div class="py-3 flex items-center justify-between gap-4 text-sm">
                        <dt class="text-manga-500 dark:text-manga-400">安装后占用</dt>
                        <dd class="font-medium text-manga-800 dark:text-manga-200">{{ detectionModule.installedSize }}</dd>
                    </div>
                    <div class="py-3 flex items-center justify-between gap-4 text-sm">
                        <dt class="text-manga-500 dark:text-manga-400">文件来源</dt>
                        <dd class="text-right text-manga-700 dark:text-manga-300">GitHub · GitHub Release · PyPI</dd>
                    </div>
                </dl>

                <div class="mt-4 flex items-start gap-2.5 text-sm"
                    :class="detectionModule.status === 'corrupted' || detectionModule.status === 'error'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-manga-500 dark:text-manga-400'">
                    <IconWarn v-if="detectionModule.status === 'corrupted' || detectionModule.status === 'error'" class="size-4 shrink-0 mt-0.5" />
                    <IconCheckMark v-else-if="detectionModule.status === 'installed'" class="size-4 shrink-0 mt-0.5 text-green-600" />
                    <IconInfo v-else class="size-4 shrink-0 mt-0.5" />
                    <span>{{ detectionModule.message }}</span>
                </div>

                <div v-if="detectionModule.status === 'downloading'" class="mt-4">
                    <div class="flex justify-between text-xs text-manga-500 mb-2">
                        <span>{{ detectionModule.message }}</span>
                        <span class="tabular-nums">{{ Math.round(detectionModule.progress) }}%</span>
                    </div>
                    <div class="h-2 bg-manga-100 dark:bg-manga-700 rounded-full overflow-hidden">
                        <div class="h-full bg-primary transition-all duration-300"
                            :style="{ width: `${detectionModule.progress}%` }" />
                    </div>
                </div>

                <p v-if="detectionModule.error" class="text-xs text-red-500 mt-3">{{ detectionModule.error }}</p>
            </div>

            <div class="px-5 py-4 bg-manga-50 dark:bg-manga-800 border-t border-manga-100 dark:border-manga-700 flex gap-3">
                <template v-if="detectionModule.status === 'installed'">
                    <button type="button"
                        class="flex-1 min-h-10 flex items-center justify-center gap-2 px-4 rounded-lg border border-manga-200 dark:border-manga-600 text-sm font-medium text-manga-700 dark:text-manga-200 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                        @click="openModuleFolder">
                        <IconFolder class="size-4" />
                        打开目录
                    </button>
                    <button type="button"
                        class="min-h-10 flex items-center justify-center gap-2 px-4 rounded-lg border border-red-200 dark:border-red-800 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer"
                        @click="showDeleteConfirm = true">
                        <IconTresh class="size-4" />
                        卸载
                    </button>
                </template>
                <button v-else type="button"
                    :disabled="detectionModule.status === 'checking' || detectionModule.status === 'downloading' || detectionModule.status === 'unavailable'"
                    class="w-full min-h-11 flex items-center justify-center gap-2 px-4 rounded-lg bg-primary text-white text-sm font-bold transition-colors enabled:hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                    @click="handleDownload">
                    <IconDownload class="size-4" />
                    {{ detectionModule.status === 'downloading' ? '正在安装' : actionLabel }}
                </button>
            </div>
        </section>

        <p class="text-xs text-manga-400 dark:text-manga-500 leading-relaxed px-1">
            安装时直接连接各项目的官方分发渠道，并在加载前校验所有模块文件。卸载不会影响手动画框、OCR 或翻译。
        </p>

        <ConfirmModal :show="showDeleteConfirm" title="卸载自动检测模块？"
            :content="`卸载后将释放 ${detectionModule.installedSize}，需要时可再次一键安装。`"
            confirm-text="确认卸载" :is-danger="true" :loading="isDeleting"
            @cancel="showDeleteConfirm = false" @confirm="handleDelete" />
    </div>
</template>
