<!-- app/pages/index.vue -->
<script setup lang="ts">
import type { ImageItem, OcrBlock } from '~/types/interface'

const route = useRoute()
const router = useRouter()
const { nextImage, prevImage, addImagesToStore, setImage, currentImageIndex, clearImages, images, tempBookPath } = useMangaImages()
const { processImages, processZip, convertPdfToImages } = useFileProcessor()
const { initSettings, settings } = useSettings()
const { showToast } = useToast()

const showSettingsModal = ref(false)

const _staticText = ref('今日はいい天気ですね。漫画を読みながら日本語を勉強します。')

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
    // 新建图书（没有图书 ID）
    if (isGuestMode.value) {
        // 情况 A: 有源文件路径 -> 自动加入书架
        if (tempBookPath.value) {
            const res = await window.electronAPI.addBook(tempBookPath.value)
            if (res.success) {
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
            else {
                showToast('❌ 加入书架失败！', 1000)
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
        await window.electronAPI.updateBookProgress({
            id: currentBookId.value,
            currentPage: currentImageIndex.value,
            lastReadTime: Date.now()
        })
        clearImages()
    }
    // 返回到书架
    router.push('/')
}

// 每一本书籍只显示一次ocr提示
const hasShownOcrHint = ref(false)
const handleOcr = () => {
    if (!hasShownOcrHint.value) {
        showToast('🖱️ 拖动鼠标框选识别区域 · 按 ESC 取消', 3000)
        hasShownOcrHint.value = true
    }
    isOcrMode.value = true
}

const ocrBlocks = ref<OcrBlock[]>([]) // 当前页面的翻译框
const activeBlockId = ref<string | undefined>(undefined)

// 如果有选中 Block，则读写 Block；否则读写静态文本
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

const currentImgId = computed(() => images.value[currentImageIndex.value]?.id)

// 进入下一页时 保存上一页的翻译框 同时每进入一页就显示之前保存的翻译框
// 每一页漫画都保存的翻译框 保存方式为 id OcrBlock数组 的对象
const allPageBlocks = ref<Record<string, OcrBlock[]>>({})
watch(currentImgId, (newId, oldId) => {
    if (oldId) {
        allPageBlocks.value[oldId] = [...ocrBlocks.value]
    }

    if (newId && allPageBlocks.value[newId]) {
        ocrBlocks.value = [...allPageBlocks.value[newId]]
    } else {
        ocrBlocks.value = []
    }

    // 进入新的漫画页就重置选中状态
    activeBlockId.value = undefined
    _staticText.value = ''
})
// 热更新ocrBlocks
watch(ocrBlocks, (newBlocks) => {
    if (currentImgId.value) {
        allPageBlocks.value[currentImgId.value] = newBlocks
    }
}, { deep: true })

const isOcrMode = ref(false)
const isOcrRecognizing = ref(false)
const isSettingsReady = ref(false)

const handleOcrCapture = async (selectionData: { left: number, top: number, width: number, height: number }) => {
    isOcrMode.value = false
    isOcrRecognizing.value = true
    let pendingBlockId: string | null = null

    try {
        if (!isSettingsReady.value) {
            await initSettings()
            isSettingsReady.value = true
        }

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

        // 3. 将屏幕上的 框选 坐标，逆向推导回高清原图中的真实坐标
        // - selectionData.left/top: 鼠标在屏幕上画框的绝对坐标 (包含浏览器边距)
        // - rect.left/top: 图片容器在屏幕上的起始坐标
        // 两者相减，得出：鼠标框选相对于图片容器左上角的偏移量。
        // - gapX/gapY: Object-contain 居中产生的黑边留白。
        // 再减去留白，得出：鼠标框选相对于“真实图片内容区域”的偏移量。
        // 最后除以 ratio (缩放比例)，将屏幕上的小尺寸，放大还原为原图里的大尺寸。
        let sourceX = (selectionData.left - rect.left - gapX) / ratio
        let sourceY = (selectionData.top - rect.top - gapY) / ratio
        // 将框选的 屏幕宽高 映射到原图片物理级别的宽高
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

        const newBlock: OcrBlock = {
            id: Date.now().toString(),
            rect: { x: sourceX, y: sourceY, width: sourceW, height: sourceH },
            original: '',
            translation: '',
            tokens: [],
            status: 'loading',
            showOriginal: false
        }
        pendingBlockId = newBlock.id
        ocrBlocks.value.push(newBlock)
        activeBlockId.value = newBlock.id
        await nextTick()

        // 5. 创建 Canvas 进行裁剪
        const canvas = document.createElement('canvas')
        // Canvas 大小设置为原图分辨率下的选区大小 (保证清晰度)
        canvas.width = sourceW
        canvas.height = sourceH
        const ctx = canvas.getContext('2d')!

        ctx.drawImage(
            imgElement,
            sourceX, sourceY, sourceW, sourceH, // 原图采样区域
            0, 0, sourceW, sourceH              // Canvas 绘制区域 0 0 为左上角 sourceW, sourceH 保证不缩放
        )

        // 转换为 base64
        const imageBase64 = canvas.toDataURL('image/png')

        console.log('发送 OCR 识别请求...')
        if (!window.electronAPI || !window.electronAPI.recognizeText) {
            throw new Error('Electron API 不可用')
        }

        // 调用 OCR 识别
        const result = await window.electronAPI.recognizeText(imageBase64)
        console.log(' OCR 识别成功:', result.text)

        if (result.success && result.text) {
            const blockIndex = ocrBlocks.value.findIndex(block => block.id === newBlock.id)
            if (blockIndex !== -1 && ocrBlocks.value[blockIndex]) {
                ocrBlocks.value[blockIndex].original = result.text
                ocrBlocks.value[blockIndex].status = 'done'
            }

            // 直接调用翻译
            console.log('[Reader] enableTranslation:', settings.value.enableTranslation, 'model:', settings.value.translationModelId)
            if (settings.value.enableTranslation) {
                await translateBlock(newBlock.id, result.text)
            } else {
                console.log('[Reader] Translation skipped because enableTranslation is false.')
            }
        } else {
            const blockIndex = ocrBlocks.value.findIndex(block => block.id === newBlock.id)
            if (blockIndex !== -1 && ocrBlocks.value[blockIndex]) {
                ocrBlocks.value[blockIndex].status = 'error'
            }
            console.error('❌ OCR 识别失败:', result.error)
            showToast(`OCR 识别失败: ${result.error}`)
        }

    } catch (error) {
        if (pendingBlockId) {
            const blockIndex = ocrBlocks.value.findIndex(block => block.id === pendingBlockId)
            if (blockIndex !== -1 && ocrBlocks.value[blockIndex]) {
                ocrBlocks.value[blockIndex].status = 'error'
            }
        }
        console.error('OCR 处理错误:', error)
        showToast(`OCR 处理错误: ${error}`, 5000)
    } finally {
        isOcrRecognizing.value = false
    }
}
const handleOcrCancel = () => {
    isOcrMode.value = false
}

// 翻译翻译框
const translateBlock = async (id: string, text: string) => {
    try {
        if (!window.electronAPI || !window.electronAPI.translate) return

        const idx = ocrBlocks.value.findIndex(b => b.id === id)
        if (idx === -1) return

        ocrBlocks.value[idx]!.status = 'loading'

        const response = await window.electronAPI.translate(text, settings.value.translationModelId)

        if (response.success && response.translation) {
            // 重新获取索引以防数组变动
            const currentIndex = ocrBlocks.value.findIndex(b => b.id === id)
            if (currentIndex !== -1 && ocrBlocks.value[currentIndex]) {
                ocrBlocks.value[currentIndex].translation = response.translation
                ocrBlocks.value[currentIndex].status = 'done'
            }
        } else {
            const errorIndex = ocrBlocks.value.findIndex(b => b.id === id)
            if (errorIndex !== -1 && ocrBlocks.value[errorIndex]) ocrBlocks.value[errorIndex].status = 'error'
        }
    } catch (e) {
        console.error('Translation failed:', e)
        const errorIndex = ocrBlocks.value.findIndex(b => b.id === id)
        if (errorIndex !== -1 && ocrBlocks.value[errorIndex]) ocrBlocks.value[errorIndex].status = 'error'
    }
}

// 用户右键删除翻译框
const handleDeleteBlock = (id: string) => {
    ocrBlocks.value = ocrBlocks.value.filter(b => b.id !== id)
    if (activeBlockId.value === id) {
        // 用户右键删除的block若为active block 则转移active到上一个
        activeBlockId.value = ocrBlocks.value.length > 0 ? ocrBlocks.value[ocrBlocks.value.length - 1]?.id : undefined
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

// 重新ocr 左键双击
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
        block.status = 'loading'

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

// 处理全局粘贴
const handlePaste = (event: ClipboardEvent) => {
    // 检查是否有输入框聚焦 如果说焦点在ipt上面则不进行操作
    const activeElement = document.activeElement as HTMLElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
        return // 如果用户在输入文字，则不拦截，让浏览器默认处理
    }

    // 检查剪贴板数据
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
        const url = URL.createObjectURL(blob)
        const newImageItem: ImageItem = {
            id: `${Date.now()}-paste`,
            url: url,
            file: blob,
            type: 'image'
        }
        addImagesToStore([newImageItem])
        originalText.value = ''
        showToast('✅ 已从剪贴板加载图片')
    } else {
        showToast('⚠️ 剪贴板中没有图片')
    }
}

let cleanup: (() => void) | undefined = undefined

onMounted(async () => {
    await initSettings()
    isSettingsReady.value = true

    const path = route.query.path as string
    const id = route.query.id as string
    const page = route.query.current ? parseInt(route.query.current as string) : 0

    if (path && window.electronAPI) {
        showToast('正在打开书籍，请稍候...', 2000)

        currentBookId.value = id
        try {
            const tempImages: ImageItem[] = []
            const fileExt = path.split('.').pop()?.toLowerCase() || ''
            if (fileExt == 'pdf') {
                tempImages.push(...(await convertPdfToImages(path)))
            }
            else if (fileExt == 'zip') {
                const arrayBuffer = await (await fetch(`manga://${path}`)).arrayBuffer()
                tempImages.push(...(await processZip(arrayBuffer)))
            }
            else {
                const res = await window.electronAPI.readImageFiles([path])
                if (res.success && res.imagePaths) {
                    for (const imagePath of res.imagePaths) {
                        tempImages.push(...processImages(imagePath))
                    }
                }
            }
            if (tempImages.length > 0) {
                addImagesToStore(tempImages)
            }

            // 跳转到记录的page
            if (page > 0) setImage(page)

            if (window.electronAPI) {
                window.electronAPI.updateBookProgress({
                    id: currentBookId.value!,
                    totalPage: tempImages.length
                })
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

})
// 页面卸载时清理监听 
onUnmounted(() => {
    if (cleanup) cleanup()
    window.removeEventListener('paste', handlePaste)
})
</script>

<template>
    <div class="min-h-screen bg-manga-50 dark:bg-manga-700">
        <!-- 全局 Toast 容器 -->
        <ToastContainer />

        <!-- 自定义标题栏 -->
        <TitleBar @open-settings="showSettingsModal = true">
            <template #extra-buttons>
                <Button class="text-sm font-bold" variant="secondary" @btn-click="goBackToLibrary">
                    <span class="flex items-center gap-2">
                        <IconBook class="size-4" />
                        返回书架
                    </span>
                </Button>
            </template>
        </TitleBar>

        <main class="max-w-screen-2xl mx-auto p-6" :class="{ 'max-w-full p-2': settings.readingMode === 'immersive' }">
            <div class="grid grid-cols-1 gap-6 h-[calc(100vh-120px)]"
                :class="settings.readingMode === 'immersive' ? '' : 'lg:grid-cols-5'">

                <!-- ocr框与图片区域 -->
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

                <!-- 右侧功能区域 非沉浸阅读就显示 -->
                <div v-if="settings.readingMode !== 'immersive'"
                    class="lg:col-span-2 overflow-hidden flex flex-col h-full">

                    <!-- 列表模式 -->
                    <div v-if="settings.readingMode === 'list'" class="h-full flex flex-col gap-4">
                        <OcrButton @ocr-btn-click="handleOcr" :is-recognizing="isOcrRecognizing"
                            :is-in-ocr="isOcrMode" />
                        <BubbleList class="flex-1 min-h-0" :blocks="ocrBlocks" :active-id="activeBlockId"
                            @select-block="handleSelectBlock" @update-block="handleUpdateBlock"
                            @delete-block="handleDeleteBlock" />
                    </div>

                    <!-- 默认学习模式 -->
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
