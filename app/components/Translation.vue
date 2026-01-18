<!-- app/components/Translation.vue -->
<script setup lang="ts">
interface Prop {
    originalText: string
}
const { originalText } = defineProps<Prop>()
const { showToast } = useToast()

const isTranslationLoading = ref(false)
const translatedText = ref<string | null>(null)
const showTranslation = ref(true)
const errorType = ref<string | null>(null)
const isFirstLoad = ref(true)

// 防抖定时器引用
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// 核心翻译函数
const fetchTranslation = async (text: string) => {
    if (!text) return

    isTranslationLoading.value = true
    errorType.value = null

    try {
        if (!window.electronAPI || !window.electronAPI.translate) {
            throw new Error('Electron API 不可用')
        }
        console.log('[Frontend] [Translation.vue] Initiating translation request for:', text)
        console.log('[Frontend] [Translation.vue] Calling window.electronAPI.translate...')

        const response = await window.electronAPI.translate(text)

        console.log('[Frontend] [Translation.vue] Received response:', response)

        if (response.success && response.translation) {
            translatedText.value = response.translation
            console.log('[Frontend] [Translation.vue] Translation success:', translatedText.value)
        } else {
            const errMsg = response.error || '未知错误'
            console.error('[Frontend] [Translation.vue] Translation failed with error:', errMsg)

            // 检测特定的错误代码
            if (errMsg.includes('MODEL_NOT_FOUND')) {
                translatedText.value = null
                errorType.value = 'MODEL_MISSING' // 标记为模型丢失
            } else {
                // 2. 普通错误 (网络、超时等)
                console.error('翻译失败:', errMsg)

                // 如果是首次加载，抑制 Toast；否则正常弹出
                if (isFirstLoad.value) {
                    console.log('首次加载失败，已抑制 Toast 提示')
                } else {
                    showToast(`翻译失败: ${errMsg}`)
                }
            }
        }
    } catch (error) {
        console.error('[Frontend] [Translation.vue] Communication error:', error)
        if (!isFirstLoad.value) {
            showToast(`翻译失败，请重试 ${error}`)
        }
    } finally {
        isTranslationLoading.value = false
        isFirstLoad.value = false
    }
}

// 监听原文变化 (自动翻译 + 防抖)
watch(() => originalText, (newText) => {
    // 1. 如果文本被清空，清空翻译
    if (!newText.trim()) {
        translatedText.value = null
        errorType.value = null
        isTranslationLoading.value = false
        if (debounceTimer) clearTimeout(debounceTimer)
        return
    }

    // 2. 只要文本变了，立即显示“翻译中”状态，给用户反馈
    isTranslationLoading.value = true
    errorType.value = null
    // 3. 清除上一次的定时器 (防抖核心)
    if (debounceTimer) {
        clearTimeout(debounceTimer)
    }

    // 4. 设置新的定时器 (800ms 后没有新输入才真正请求)
    debounceTimer = setTimeout(() => {
        fetchTranslation(newText)
    }, 800) // 800ms 延迟，既不显得太卡，又能有效防止频繁请求

}, { immediate: true }) //  immediate: true 保证组件一加载如果有字也翻译

// 手动重新翻译 (不走防抖，立即触发)
const handleRetranslate = async () => {
    if (!originalText) return
    translatedText.value = null // 为了视觉上让用户感到“刷新了”，先清空一下
    // 立即清除可能存在的防抖定时器，避免冲突
    if (debounceTimer) clearTimeout(debounceTimer)
    // 用户手动点击肯定不是首次加载
    isFirstLoad.value = false
    await fetchTranslation(originalText)
}

// 显隐切换
const toggleTranslation = () => {
    showTranslation.value = !showTranslation.value
}

// 组件销毁时清理定时器
onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
    <div class="card">
        <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-semibold text-manga-600 dark:text-manga-200">
                🌐 翻译
            </div>
            <!-- 只有在显示且有翻译结果时才显示复制按钮 -->
            <CopyButton v-if="showTranslation && translatedText && !isTranslationLoading"
                :textToCopy="translatedText" />
        </div>

        <!-- 翻译内容区域 -->
        <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0"
            leave-to-class="opacity-0">
            <div v-if="showTranslation">
                <!-- 加载状态：包括 防抖等待期 和 API请求期 -->
                <div v-if="isTranslationLoading"
                    class="flex items-center gap-2 text-manga-600 dark:text-manga-400 min-h-6">
                    <div class="animate-spin h-4 w-4 border-2 rounded-full border-primary border-t-transparent"></div>
                    <span class="text-sm">翻译中...</span>
                </div>

                <!-- 模型缺失提示 (纯文字提示) -->
                <div v-else-if="errorType === 'MODEL_MISSING'"
                    class="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-800">
                    <div class="flex items-center gap-2 mb-1">
                        <IconWarn class="size-4" />
                        <span class="font-bold">模型未就绪</span>
                    </div>
                    <p class="text-xs opacity-90 pl-6">
                        请前往 <span class="font-bold underline">设置 > 翻译模型</span> 下载并安装模型。
                    </p>
                </div>

                <!-- 翻译结果 -->
                <p v-else-if="translatedText"
                    class="text-sm leading-relaxed text-manga-900 dark:text-manga-100 selection:bg-primary selection:text-white">
                    {{ translatedText }}
                </p>

                <!-- 空状态 -->
                <p v-else class="text-sm text-manga-600 dark:text-manga-400">
                    等待原文输入...
                </p>
            </div>
        </Transition>

        <!-- 操作按钮组 -->
        <div class="mt-3 flex gap-2">
            <!-- 显隐按钮 -->
            <Button size="sm" @btn-click="toggleTranslation">
                {{ showTranslation ? "隐藏" : "显示" }}翻译
            </Button>

            <!-- 重新翻译按钮：始终显示，方便用户随时重试或刷新API结果 -->
            <!-- 只有当有原文时才允许点击 -->
            <Button v-if="showTranslation" variant="secondary" size="sm"
                :disabled="isTranslationLoading || !originalText" @btn-click="handleRetranslate">
                重新翻译
            </Button>
        </div>
    </div>
</template>
