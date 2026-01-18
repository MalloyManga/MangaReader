<!-- app/pages/index.vue -->
<script setup lang="ts">
// 原文显示板块 使用 v-model 双向绑定
const originalText = ref('今日はいい天気ですね。漫画を読みながら日本語を勉強します。')
const showSettingsModal = ref(false) // settingModal显示
const isOcrMode = ref(false) // ocr模式 鼠标十字crosshair
const isOcrRecognizing = ref(false) // 正在调用模型识别
const { showToast } = useToast()

const handleOcr = () => {
    // 启动ocr时显示一个tooltip提示
    showToast('🖱️ 拖动鼠标框选识别区域 · 按 ESC 取消', 1500)

    // 激活 OCR 模式，显示框选 overlay
    isOcrMode.value = true
}

const { initSettings, settings } = useSettings()

// ocr识别完成 处理ocrCaptureImage
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
            originalText.value = result.text
            console.log(' OCR 识别成功:', result.text)
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

const handleAppReady = () => {
    console.log('App Ready! Triggering initial translation...')

    // 这里不需要手动调翻译 API，因为 originalText 的值本身就没变。
    // 但是，Translation 组件是 watch immediate 的。
    // 当 Loader 存在时，Translation 组件其实已经加载并在后台跑了一次翻译了。
    // 为了让用户有“加载好了”的感觉，我们可以在这里做点别的，或者什么都不做，
    // 因为 Translation 组件会在后台默默把那句日语翻译好，等 Loader 一消失，用户看到的就是翻译好的结果。

    // 如果你想强制刷新一下：
    const temp = originalText.value
    originalText.value = ''
    nextTick(() => originalText.value = temp)
}

onMounted(() => {
    initSettings()



    // 监听来自 Electron 的快捷键信号
    if (!window.electronAPI) {
        console.warn('Electron API not available for shortcut handling')
        return
    }
    // 当快捷键按下 -> 执行 handleOcr (和点击按钮效果一样)
    const cleanup = window.electronAPI.onShortcutTriggered(() => {
        console.log('Vue 收到快捷键信号，启动 OCR')
        // 只有当前不在 OCR 模式，且不在识别中才启动
        if (!isOcrMode.value && !isOcrRecognizing.value) {
            handleOcr()
        }
    })

    // 页面卸载时清理监听 (虽然 index.vue 通常不卸载，但这是好习惯)
    onUnmounted(() => {
        cleanup()
    })
})
</script>

<template>
    <div class="min-h-screen bg-manga-50 dark:bg-manga-700">
        <GlobalLoader @ready="handleAppReady" />

        <!-- 全局 Toast 容器 -->
        <ToastContainer />

        <!-- 自定义标题栏 -->
        <TitleBar @open-settings="showSettingsModal = true" />
        <main class="max-w-screen-2xl mx-auto p-6">
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-120px)]">
                <div class="lg:col-span-3 relative">
                    <FileUpload />
                    <!-- OCR 框选 overlay -->
                    <OcrOverlay v-if="isOcrMode" @capture-complete="handleOcrCapture" @cancel="handleOcrCancel" />
                </div>

                <div class="lg:col-span-2 space-y-4">
                    <OcrButton @ocr-btn-click="handleOcr" :is-recognizing="isOcrRecognizing" :is-in-ocr="isOcrMode" />
                    <OriginalText :is-recognizing="isOcrRecognizing" v-model:local-text="originalText" />
                    <!-- 这里indexvue起到一个父组件传递originalText的作用 v-model 传递给originalText再传递给Translationvue -->
                    <TokenizedWords v-if="settings.enableTokenization" :origin-text="originalText" />
                    <Translation v-if="settings.enableTranslation" :original-text="originalText" />
                    <HintCard v-if="settings.enableTokenization" text="提示：点击分词结果中的单词可查看详情" />
                </div>
            </div>
        </main>

        <SettingsModal :show="showSettingsModal" @close="showSettingsModal = false" />
    </div>
</template>
