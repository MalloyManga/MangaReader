<!-- app/pages/index.vue -->
<script setup lang="ts">
import type { OcrBlock } from '~/types/interface'

const route = useRoute()
const router = useRouter()
const { nextImage, prevImage, addImagesToStore, setImage, currentImageIndex, clearImages, images, tempBookPath } = useMangaImages()

// Book State
const currentBookId = ref<string | null>(null)
const isGuestMode = computed(() => !currentBookId.value)

// Progress Saving (Debounced)
let saveTimeout: NodeJS.Timeout | null = null
watch(currentImageIndex, (newIndex) => {
    if (!isGuestMode.value && currentBookId.value && window.electronAPI) {
        if (saveTimeout) clearTimeout(saveTimeout)
        saveTimeout = setTimeout(() => {
            window.electronAPI.updateBookProgress({
                id: currentBookId.value!,
                currentPage: newIndex,
                lastReadTime: Date.now()
            })
        }, 1000)
    }
})

const goBackToLibrary = async () => {
    // 访客模式（没有 ID）
    if (isGuestMode.value) {
        // 情况 A: 有源文件路径 -> 自动加入书架
        if (tempBookPath.value) {
            const res = await window.electronAPI.addBook(tempBookPath.value)
            if (res.success) {
                // [Fix] Automatically save progress (Total Pages) for the newly added book
                // So the progress bar shows up correctly in the library immediately
                if (res.book && res.book.id) {
                    await window.electronAPI.updateBookProgress({
                        id: res.book.id,
                        totalPage: images.value.length,
                        currentPage: currentImageIndex.value,
                        lastReadTime: Date.now()
                    })
                }
                showToast('✅ 已自动加入书架', 1000)
            }
        }
        // 情况 B: 纯内存数据 -> 仅提示
        else {
            showToast('👋 临时阅读结束', 1500)
        }

        // 无论哪种情况，退出时都清空内存
        clearImages()
    }
    // 书架模式 (有 ID)
    else if (currentBookId.value) {
        // 强制保存一次进度再退出
        await window.electronAPI?.updateBookProgress({
            id: currentBookId.value,
            currentPage: currentImageIndex.value,
            lastReadTime: Date.now()
        })
        clearImages()
    }
    router.push('/')
}

// Ocr Block State
const ocrBlocks = ref<OcrBlock[]>([])
// Store blocks for each page: Record<ImageID, Blocks[]>
const allPageBlocks = ref<Record<string, OcrBlock[]>>({})
const activeBlockId = ref<string | undefined>(undefined)
const _staticText = ref('今日はいい天気ですね。漫画を読みながら日本語を勉強します。')

// 双向绑定代理：如果有选中 Block，则读写 Block；否则读写静态文本
const originalText = computed({
    get: () => {
        const block = ocrBlocks.value.find(b => b.id === activeBlockId.value)
        return block ? block.original : _staticText.value
    },
    set: (val) => {
        const block = ocrBlocks.value.find(b => b.id === activeBlockId.value)
        if (block) {
            block.original = val
        } else {
            _staticText.value = val
        }
    }
})

// [Fix] Persist blocks across page navigation
const currentImgId = computed(() => images.value[currentImageIndex.value]?.id)

// Save blocks when leaving a page, Load blocks when entering a page
watch(currentImgId, (newId, oldId) => {
    // 1. Save current blocks to map using old ID
    if (oldId) {
        allPageBlocks.value[oldId] = [...ocrBlocks.value]
    }

    // 2. Load blocks for new ID
    if (newId && allPageBlocks.value[newId]) {
        ocrBlocks.value = [...allPageBlocks.value[newId]]
    } else {
        ocrBlocks.value = []
    }

    // Reset selection state
    activeBlockId.value = undefined
    _staticText.value = ''
})

// [Optional] Sync changes immediately to map (Safety net)
watch(ocrBlocks, (newBlocks) => {
    if (currentImgId.value) {
        allPageBlocks.value[currentImgId.value] = newBlocks
    }
}, { deep: true })

const showSettingsModal = ref(false) // settingModal显示
const isOcrMode = ref(false) // ocr模式 鼠标十字crosshair
const isOcrRecognizing = ref(false) // 正在调用模型识别
const { showToast } = useToast()

// OCR Hint Logic (Show once per book session)
const hasShownOcrHint = ref(false)
watch(currentBookId, () => {
    hasShownOcrHint.value = false
})

const handleOcr = () => {
    // 启动ocr时显示一个tooltip提示 (Only once per session)
    if (!hasShownOcrHint.value) {
        showToast('🖱️ 拖动鼠标框选识别区域 · 按 ESC 取消', 3000)
        hasShownOcrHint.value = true
    }

    // 激活 OCR 模式，显示框选 overlay
    isOcrMode.value = true
}

const { initSettings, settings } = useSettings()

const handleOcrCapture = async (selectionData: { left: number, top: number, width: number, height: number }) => {
    isOcrMode.value = false
    isOcrRecognizing.value = true

    try {
        console.log('OCR 框选区域:', selectionData)

        // 查找 ImageUpload 组件内的图片元素
        const imgElement = document.querySelector('img[alt^="当前图片"]') as HTMLImageElement

        if (!imgElement) {
            throw new Error('未找到图片元素,请先上传图片')
        }

        if (!imgElement.complete || !imgElement.naturalWidth) {
            throw new Error('图片未加载完成')
        }

        // 1. 获取图片元素在屏幕上的位置和尺寸 (Client Dimensions)
        const rect = imgElement.getBoundingClientRect()
        const { naturalWidth, naturalHeight } = imgElement

        // 2. 计算 object-fit: contain 导致的真实渲染区域
        // 计算宽比和高比
        const rw = rect.width / naturalWidth
        const rh = rect.height / naturalHeight

        // 真实缩放比例 (取较小值，因为是 contain)
        const ratio = Math.min(rw, rh)

        // 图片实际渲染的宽高
        const realW = naturalWidth * ratio
        const realH = naturalHeight * ratio

        // 计算留白 (Letterboxing / Pillarboxing)
        const gapX = (rect.width - realW) / 2
        const gapY = (rect.height - realH) / 2

        // 3. 将屏幕坐标映射回原图坐标
        // selectionData.left/top 是相对于视口的坐标
        // rect.left/top 也是相对于视口的坐标
        // 减去 rect.left/top 得到相对于 img 元素的坐标
        // 再减去 gapX/gapY 得到相对于渲染图片内容的坐标
        // 最后除以 ratio 还原为原图尺寸
        let sourceX = (selectionData.left - rect.left - gapX) / ratio
        let sourceY = (selectionData.top - rect.top - gapY) / ratio
        let sourceW = selectionData.width / ratio
        let sourceH = selectionData.height / ratio

        // 4. 边界检查 (防止选区超出图片实际范围)
        // 修正 X
        if (sourceX < 0) {
            sourceW += sourceX // 减去左边超出的部分
            sourceX = 0
        }
        if (sourceX + sourceW > naturalWidth) {
            sourceW = naturalWidth - sourceX
        }

        // 修正 Y
        if (sourceY < 0) {
            sourceH += sourceY // 减去顶部超出的部分
            sourceY = 0
        }
        if (sourceY + sourceH > naturalHeight) {
            sourceH = naturalHeight - sourceY
        }

        // 如果选区完全在图片外，报错或返回
        if (sourceW <= 0 || sourceH <= 0) {
            throw new Error('选区未包含有效图片内容')
        }

        // 5. 创建 Canvas 进行裁剪
        const canvas = document.createElement('canvas')
        // Canvas 大小设置为原图分辨率下的选区大小 (保证清晰度)
        canvas.width = sourceW
        canvas.height = sourceH
        const ctx = canvas.getContext('2d')!

        // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
        ctx.drawImage(
            imgElement,
            sourceX, sourceY, sourceW, sourceH, // 原图采样区域
            0, 0, sourceW, sourceH              // Canvas 绘制区域
        )

        // 转换为 base64
        const imageBase64 = canvas.toDataURL('image/png')

        console.log('发送 OCR 识别请求...')
        if (!window.electronAPI || !window.electronAPI.recognizeText) {
            throw new Error('Electron API 不可用')
        }

        // 调用 OCR 识别
        const result = await window.electronAPI.recognizeText(imageBase64)

        if (result.success && result.text) {
            const newBlock: OcrBlock = {
                id: Date.now().toString(),
                rect: { x: sourceX, y: sourceY, width: sourceW, height: sourceH },
                original: result.text,
                translation: '',
                tokens: [],
                status: 'done',
                showOriginal: false
            }
            // Add block first
            ocrBlocks.value.push(newBlock)
            activeBlockId.value = newBlock.id
            console.log(' OCR 识别成功:', result.text)

            // Trigger translation if enabled
            if (settings.value.enableTranslation) {
                translateBlock(newBlock.id, result.text)
            }
        } else {
            console.error('❌ OCR 识别失败:', result.error)
            showToast(`OCR 识别失败: ${result.error}`)
        }

    } catch (error) {
        console.error('OCR 处理错误:', error)
        showToast(`OCR 处理错误: ${error}`, 5000)
    } finally {
        isOcrRecognizing.value = false
    }
}

const handleOcrCancel = () => {
    // 用户主动按下esc推出ocr模式
    isOcrMode.value = false
}

const translateBlock = async (id: string, text: string) => {
    try {
        if (!window.electronAPI || !window.electronAPI.translate) return

        const idx = ocrBlocks.value.findIndex(b => b.id === id)
        if (idx === -1) return

        ocrBlocks.value[idx]!.status = 'loading'

        const response = await window.electronAPI.translate(text)

        if (response.success && response.translation) {
            // 重新获取索引以防数组变动
            const currentIndex = ocrBlocks.value.findIndex(b => b.id === id)
            if (currentIndex !== -1 && ocrBlocks.value[currentIndex]) {
                ocrBlocks.value[currentIndex]!.translation = response.translation
                ocrBlocks.value[currentIndex]!.status = 'done'
            }
        } else {
            const errorIndex = ocrBlocks.value.findIndex(b => b.id === id)
            if (errorIndex !== -1 && ocrBlocks.value[errorIndex]) ocrBlocks.value[errorIndex]!.status = 'error'
        }
    } catch (e) {
        console.error('Translation failed:', e)
        const errorIndex = ocrBlocks.value.findIndex(b => b.id === id)
        if (errorIndex !== -1) ocrBlocks.value[errorIndex]!.status = 'error'
    }
}

const handleDeleteBlock = (id: string) => {
    ocrBlocks.value = ocrBlocks.value.filter(b => b.id !== id)
    if (activeBlockId.value === id) {
        activeBlockId.value = ocrBlocks.value.length > 0 ? ocrBlocks.value[ocrBlocks.value.length - 1]!.id : undefined
    }
}

const handleUpdateBlock = (updatedBlock: OcrBlock) => {
    const idx = ocrBlocks.value.findIndex(b => b.id === updatedBlock.id)
    if (idx !== -1) {
        // 如果原文改变了，重新翻译
        if (ocrBlocks.value[idx]!.original !== updatedBlock.original && settings.value.enableTranslation) {
            // 防止双向绑定循环触发，简单判断一下
            if (updatedBlock.original) translateBlock(updatedBlock.id, updatedBlock.original)
        }
        ocrBlocks.value[idx] = updatedBlock
    }
}

// Re-OCR Logic (Double Click)
const handleReOcr = async (id: string) => {
    const block = ocrBlocks.value.find(b => b.id === id)
    if (!block) return

    try {
        const imgElement = document.querySelector('img[alt^="当前图片"]') as HTMLImageElement
        if (!imgElement || !imgElement.complete || !imgElement.naturalWidth) {
            showToast('未找到图片')
            return
        }

        const canvas = document.createElement('canvas')
        canvas.width = block.rect.width
        canvas.height = block.rect.height
        const ctx = canvas.getContext('2d')!

        ctx.drawImage(
            imgElement,
            block.rect.x, block.rect.y, block.rect.width, block.rect.height,
            0, 0, block.rect.width, block.rect.height
        )

        const imageBase64 = canvas.toDataURL('image/png')

        showToast('🔁 重新识别中...')
        block.status = 'loading' // Optimistic update

        if (!window.electronAPI || !window.electronAPI.recognizeText) throw new Error('API Unavailable')

        const result = await window.electronAPI.recognizeText(imageBase64)

        if (result.success && result.text) {
            handleUpdateBlock({
                ...block,
                original: result.text,
                status: 'done',
                showOriginal: true
            })
            showToast('✅ 重新识别成功')
        } else {
            block.status = 'error'
            showToast(`重新识别失败: ${result.error}`)
        }

    } catch (e) {
        console.error('Re-OCR Error', e)
        showToast('重新识别出错')
    }
}

const handleSelectBlock = (id: string) => {
    activeBlockId.value = id
}

// Global Paste Handler
const handlePaste = (event: ClipboardEvent) => {
    // 1. 冲突检查：检查是否有输入框聚焦
    const activeElement = document.activeElement as HTMLElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
        return // 如果用户在输入文字，则不拦截，让浏览器默认处理
    }

    // 2. 检查剪贴板数据
    if (!event.clipboardData || !event.clipboardData.items) return

    const items = event.clipboardData.items
    let blob: File | null = null

    // 查找图片类型的条目 (使用 Array.from 避免 TS 索引报错)
    for (const item of Array.from(items)) {
        if (item.type.indexOf('image') !== -1) {
            blob = item.getAsFile()
            break
        }
    }

    if (blob) {
        event.preventDefault() // 阻止默认粘贴行为（防止重复）

        const url = URL.createObjectURL(blob)
        // 构造 ImageItem（模拟 Result）
        // 这里不需要显式引入接口，只要结构匹配即可，TypeScript 在 Vue setup 中通常能推断
        const newImageItem = {
            id: `${Date.now()}-paste`,
            url: url,
            file: blob,
            type: 'image'
        } as any

        // 添加到 Store
        addImagesToStore([newImageItem])

        // 4. 清除旧的 OCR 结果和翻译
        originalText.value = ''

        showToast('✅ 已从剪贴板加载图片')
    } else {
        showToast('⚠️ 剪贴板中没有图片')
    }
}

let cleanup: (() => void) | undefined = undefined

onMounted(async () => {
    initSettings()

    // 1. Check Route Query (Existing Book)
    const path = route.query.path as string
    const id = route.query.id as string
    const page = route.query.current ? parseInt(route.query.current as string) : 0

    if (path && window.electronAPI) {
        // [UX] Show toast for loading since it might take a second for large folders
        showToast('正在打开书籍，请稍候...', 2000)

        currentBookId.value = id
        // Load files from path
        try {
            const res = await window.electronAPI.loadBook(path)
            if (res.success && res.images && res.images.length > 0) {
                const items = res.images.map((img: any) => ({
                    id: img.name,
                    url: img.data, // base64 string
                    file: new File([], img.name), // 占位File
                    type: 'image' as const
                }))
                addImagesToStore(items)

                // Initialize page
                if (page > 0) setImage(page)

                // [Fix] Update Total Page Count to Store
                // Ensure the progress bar in the library shows the total pages even if we don't flip a page
                if (window.electronAPI) {
                    window.electronAPI.updateBookProgress({
                        id: currentBookId.value!,
                        totalPage: items.length
                    })
                }

            } else {
                showToast(res.error || '无法加载书籍')
            }
        } catch (e) {
            console.error('Load book error:', e)
            showToast('加载书籍失败')
        }
    }

    // 注册全局粘贴监听
    window.addEventListener('paste', handlePaste)

    // 监听来自 Electron 的快捷键信号
    if (!window.electronAPI) {
        console.warn('Electron API not available for shortcut handling')
        return
    }
    // 当快捷键按下 -> 根据 action 执行对应操作
    // 赋值给外层的 cleanup 变量
    cleanup = window.electronAPI.onShortcutTriggered((action: string) => {
        console.log('Vue 收到快捷键信号:', action)

        if (action === 'ocr') {
            // 只有当前不在 OCR 模式，且不在识别中才启动
            if (!isOcrMode.value && !isOcrRecognizing.value) {
                handleOcr()
            }
        } else if (action === 'next') {
            nextImage()
        } else if (action === 'prev') {
            prevImage()
        }
    })

    // 页面卸载时清理监听 (虽然 index.vue 通常不卸载，但这是好习惯)
    onUnmounted(() => {
        if (cleanup) cleanup()
        window.removeEventListener('paste', handlePaste)
    })
})
</script>

<template>
    <div class="min-h-screen bg-manga-50 dark:bg-manga-700">
        <!-- 全局 Toast 容器 -->
        <ToastContainer />

        <!-- 自定义标题栏 -->
        <TitleBar @open-settings="showSettingsModal = true">
            <template #extra-buttons>
                <Button class="text-sm font-bold" variant="secondary" @btn-click="goBackToLibrary">📚 返回书架</Button>
            </template>
        </TitleBar>
        <main class="max-w-screen-2xl mx-auto p-6" :class="{ 'max-w-full p-2': settings.readingMode === 'immersive' }">
            <div class="grid grid-cols-1 gap-6 h-[calc(100vh-120px)]"
                :class="settings.readingMode === 'immersive' ? '' : 'lg:grid-cols-5'">

                <!-- Image Area -->
                <div class="relative h-full"
                    :class="settings.readingMode === 'immersive' ? 'lg:col-span-5' : 'lg:col-span-3'">
                    <FileUpload>
                        <template #overlay="{ naturalSize, containerSize }">
                            <BubbleLayer v-if="ocrBlocks.length > 0" :blocks="ocrBlocks"
                                :image-natural-size="naturalSize" :container-size="containerSize"
                                @select-block="handleSelectBlock" @update-block="handleUpdateBlock"
                                @delete-block="handleDeleteBlock" @re-ocr="handleReOcr" />
                        </template>
                    </FileUpload>
                    <!-- OCR 框选 overlay -->
                    <OcrOverlay v-if="isOcrMode" @capture-complete="handleOcrCapture" @cancel="handleOcrCancel" />
                </div>

                <!-- Sidebar Area -->
                <div v-if="settings.readingMode !== 'immersive'"
                    class="lg:col-span-2 overflow-hidden flex flex-col h-full">

                    <!-- List Mode -->
                    <div v-if="settings.readingMode === 'list'" class="h-full flex flex-col gap-4">
                        <OcrButton @ocr-btn-click="handleOcr" :is-recognizing="isOcrRecognizing"
                            :is-in-ocr="isOcrMode" />
                        <BubbleList class="flex-1 min-h-0" :blocks="ocrBlocks" :active-id="activeBlockId"
                            @select-block="handleSelectBlock" @update-block="handleUpdateBlock"
                            @delete-block="handleDeleteBlock" />
                    </div>

                    <!-- Study Mode (Classic) -->
                    <div v-else class="space-y-4 overflow-y-auto pr-2 pb-4">
                        <OcrButton @ocr-btn-click="handleOcr" :is-recognizing="isOcrRecognizing"
                            :is-in-ocr="isOcrMode" />
                        <OriginalText :is-recognizing="isOcrRecognizing" v-model:local-text="originalText" />
                        <TokenizedWords v-if="settings.enableTokenization" :origin-text="originalText" />
                        <Translation v-if="settings.enableTranslation" :original-text="originalText" />
                    </div>
                </div>
            </div>
        </main>

        <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
    </div>
</template>
