<!-- components/SettingsTranslate.vue -->
<script setup lang="ts">
const { openModelFolder } = useSettings()
const { showToast } = useToast()
const { model, checkModelStatus } = useModelStatus()
const showDeleteModal = ref(false)
const isDeleting = ref(false)
const models = computed(() => [model])

const handleDownload = async () => {
    if (model.status === 'downloading') return
    model.status = 'downloading'
    model.progress = 0

    try {
        // 发起下载请求
        const res = await window.electronAPI.downloadModel()

        // 下载完成后 (Python 那边函数返回了)
        if (res.success) {
            model.progress = 100
            model.status = 'downloaded'
        } else {
            showToast(`下载失败: ${res.error}`)
            model.status = 'not_downloaded'
        }
    } catch (e) {
        model.status = 'not_downloaded'
        showToast('下载出错')
    }
}

const handleClickDelete = () => {
    showDeleteModal.value = true
}

const confirmDelete = async () => {
    isDeleting.value = true
    try {
        const res = await window.electronAPI.deleteModel()
        if (res.success) {
            model.status = 'not_downloaded'
            model.progress = 0
            showDeleteModal.value = false // 成功后关闭弹窗
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

// 组件挂载时检查状态
onMounted(() => {
    checkModelStatus()
    // 保存清理函数，组件销毁时取消监听
    const cleanup = window.electronAPI.onDownloadProgress((percent: number) => {
        // 只有当前状态是 downloading 时才更新，防止干扰
        if (model.status === 'downloading') {
            model.progress = percent

            // 如果下载完了，自动变状态
            if (percent >= 100) {
                model.status = 'downloaded'
            }
        }
    })

    onUnmounted(() => {
        cleanup()
    })
})
</script>

<template>
    <div class="space-y-6 animate-fade-in flex flex-col h-full">
        <!-- 头部 -->
        <div>
            <h3 class="text-lg font-bold text-manga-900 dark:text-white">翻译模型管理</h3>
            <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">管理本地离线翻译模型</p>
        </div>

        <!-- 模型列表 -->
        <div class="flex-1 space-y-4 overflow-y-auto pr-1">
            <div v-for="model in models" :key="model.id"
                class="bg-white dark:bg-manga-900 border border-manga-200 dark:border-manga-700 rounded-lg p-5 shadow-sm transition-all hover:shadow-md hover:border-manga-300">

                <div class="flex justify-between items-center">
                    <!-- 左侧信息 -->
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-bold text-manga-900 dark:text-white text-base">{{ model.name }}</h4>
                            <span
                                class="px-2 py-0.5 rounded text-[10px] font-bold bg-manga-100 dark:bg-manga-800 text-manga-600 dark:text-manga-400">
                                {{ model.size }}
                            </span>
                        </div>
                        <p class="text-sm text-manga-500 mt-1">{{ model.description }}</p>
                    </div>

                    <!-- 右侧操作区 -->
                    <div class="flex items-center gap-3">

                        <!-- 状态：正在检查 -->
                        <div v-if="model.status === 'checking'" class="text-xs text-manga-400">
                            检查中...
                        </div>

                        <!-- 状态：已下载 -->
                        <div v-else-if="model.status === 'downloaded'" class="flex items-center gap-1">
                            <span
                                class="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                <IconSuccess class="size-4" />
                                已就绪
                            </span>
                            <button @click="handleClickDelete" title="删除模型"
                                class="flex items-center justify-center w-8 h-8 text-manga-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all cursor-pointer">
                                <IconTresh class="size-5" />
                            </button>
                        </div>

                        <!-- 状态：下载中 -->
                        <div v-else-if="model.status === 'downloading'" class="w-32">
                            <div class="flex justify-between text-xs text-manga-500 mb-1">
                                <span>下载中...</span>
                                <span>{{ Math.round(model.progress) }}%</span>
                            </div>
                            <div class="w-full bg-manga-100 dark:bg-manga-700 rounded-full h-1.5 overflow-hidden">
                                <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                    :style="{ width: model.progress + '%' }"></div>
                            </div>
                        </div>

                        <!-- 状态：未下载 -->
                        <div v-else>
                            <button @click="handleDownload"
                                class="flex items-center gap-2 px-4 py-2 bg-manga-900 dark:bg-manga-700 hover:bg-blue-600 dark:hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-all shadow-sm cursor-pointer">
                                <IconDownload class="size-4" />
                                下载
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 底部功能区 -->
        <div class="pt-5 border-t border-manga-100 dark:border-manga-700">
            <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800/50">
                <div class="flex items-start gap-3">
                    <div class="mt-0.5 text-blue-600 dark:text-blue-400">
                        <!-- <IconInfo class="size-5" /> -->
                        <IconTip class="size-5" />
                    </div>
                    <div class="flex-1">
                        <h4 class="text-sm font-bold text-manga-900 dark:text-blue-100">下载遇到问题？</h4>
                        <p class="text-xs text-manga-500 dark:text-blue-200/70 mt-1 leading-relaxed">
                            如果自动下载失败，您可以手动下载模型文件，并将其放入对应目录。
                            <br>
                            <span class="opacity-75 text-[10px]">(注意文件名必须完全一致)</span>
                        </p>

                        <div class="flex gap-3 mt-3">
                            <!-- 按钮 1: 打开文件夹 -->
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

        <ConfirmModal :show="showDeleteModal" title="删除模型文件？"
            :content="`确定要删除 ${model.name} 吗？这将释放约 ${model.size} 的磁盘空间。`" confirm-text="确认删除" :is-danger="true"
            :loading="isDeleting" @cancel="showDeleteModal = false" @confirm="confirmDelete" />
    </div>
</template>
