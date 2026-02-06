<!-- components/SettingsGeneral.vue -->
<script setup lang="ts">
const { settings, saveSettings } = useSettings()
const { showToast } = useToast()
const { model, checkModelStatus } = useModelStatus()

// Check model status on mount to ensure we have the correct state
onMounted(() => {
    checkModelStatus()
})

const isModeDisabled = (modeValue: string) => {
    // Only 'list' and 'immersive' modes require the model (per user request)
    if (modeValue === 'study') return false
    return model.status !== 'downloaded'
}

const handleModeClick = (modeValue: any) => {
    if (isModeDisabled(modeValue)) {
        showToast('⚠️ 该模式需要翻译模型，请先在“翻译设置”中下载模型')
        return
    }
    settings.value.readingMode = modeValue
    saveSettings()
}

const themeOptions = ['light', 'dark', 'system'] as const
const modeOptions = [
    {
        value: 'study',
        label: '精读模式',
        desc: '经典的左图右文布局，适合逐句精读学习。',
        hint: ''
    },
    {
        value: 'list',
        label: '列表模式',
        desc: 'OCR 结果以列表形式排列，适合快速浏览。',
        hint: '建议配置ocr快捷键'
    },
    {
        value: 'immersive',
        label: '沉浸模式',
        desc: '全屏显示图片，翻译作为浮层显示。',
        hint: '需要配置ocr快捷键'
    }
] as const

const isRecording = ref(false)
// 记录当前正在录制哪个快捷键
const recordingTarget = ref<'ocrShortcut' | 'prevImageShortcut' | 'nextImageShortcut' | null>(null)

const startRecording = (target: 'ocrShortcut' | 'prevImageShortcut' | 'nextImageShortcut') => {
    isRecording.value = true
    recordingTarget.value = target
    showToast('按下组合键，Enter 确认，Esc 取消', 3000)
}

const stopRecording = () => {
    isRecording.value = false
    recordingTarget.value = null
    // 移除 ref 操作，依赖原生 focus/blur 行为即可
}

const handleKeyDown = (e: KeyboardEvent) => {
    if (!isRecording.value || !recordingTarget.value) return
    e.preventDefault(); e.stopPropagation()

    if (e.key === 'Escape') {
        stopRecording();
        (e.target as HTMLElement).blur()
        return
    }
    if (e.key === 'Enter') {
        saveSettings() // 确认后自动保存
        stopRecording();
        (e.target as HTMLElement).blur()
        return
    }
    if (e.key === 'Backspace') {
        if (recordingTarget.value) {
            settings.value[recordingTarget.value] = ''
        }
        // 清空后立即保存并退出录制，体验更流畅
        saveSettings()
        stopRecording();
        (e.target as HTMLElement).blur()
        showToast('快捷键已清除', 1500)
        return
    }

    const keys = []
    if (e.ctrlKey) keys.push('Ctrl')
    if (e.metaKey) keys.push('Cmd')
    if (e.altKey) keys.push('Alt')
    if (e.shiftKey) keys.push('Shift')
    const specialKeys = ['Control', 'Meta', 'Alt', 'Shift']
    if (!specialKeys.includes(e.key)) {
        let keyName = e.key

        // Electron 快捷键名称映射
        const keyMap: Record<string, string> = {
            'ArrowUp': 'Up',
            'ArrowDown': 'Down',
            'ArrowLeft': 'Left',
            'ArrowRight': 'Right',
            ' ': 'Space'
        }

        if (keyMap[keyName]) {
            keyName = keyMap[keyName] as string
        } else if (keyName.length === 1) {
            // 字母/数字转大写
            keyName = keyName.toUpperCase()
        }

        keys.push(keyName)
    }
    if (keys.length > 0 && recordingTarget.value) {
        settings.value[recordingTarget.value] = keys.join(' + ')
    }
}
</script>

<template>
    <div class="space-y-8 animate-fade-in">

        <section>
            <h3 class="text-lg font-bold text-manga-900 dark:text-white mb-3">阅读模式</h3>
            <div class="flex flex-col gap-3">
                <button v-for="mode in modeOptions" :key="mode.value" @click="handleModeClick(mode.value)"
                    class="flex items-center text-left w-full p-3 rounded-xl border transition-all cursor-pointer group relative overflow-hidden"
                    :class="[
                        settings.readingMode === mode.value
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-1 ring-blue-200 dark:ring-blue-800'
                            : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 hover:bg-manga-50 dark:hover:bg-manga-800',
                        isModeDisabled(mode.value) ? 'opacity-60 cursor-not-allowed grayscale' : ''
                    ]">

                    <!-- Disabled overlay / hint -->
                    <div v-if="isModeDisabled(mode.value)"
                        class="absolute inset-0 z-10 bg-white/50 dark:bg-black/50 flex items-center justify-center backdrop-blur-[1px]">
                        <span
                            class="bg-black/75 text-white text-[10px] px-2 py-1 rounded-full font-medium tracking-wide shadow-sm">
                            需配置翻译模型
                        </span>
                    </div>

                    <div class="mr-3 p-2 rounded-lg shrink-0"
                        :class="settings.readingMode === mode.value ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200' : 'bg-manga-100 dark:bg-manga-800 text-manga-500'">
                        <IconBook v-if="mode.value === 'study'" class="size-5" />
                        <IconChatBubble v-if="mode.value === 'list'" class="size-5" />
                        <IconFullScreen v-if="mode.value === 'immersive'" class="size-5" />
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                            <div class="font-bold text-sm"
                                :class="settings.readingMode === mode.value ? 'text-blue-700 dark:text-blue-300' : 'text-manga-900 dark:text-gray-200'">
                                {{ mode.label }}</div>
                        </div>
                        <div class="text-xs leading-relaxed"
                            :class="settings.readingMode === mode.value ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-manga-500 dark:text-gray-400'">
                            {{ mode.desc }}</div>
                        <div v-if="mode.hint" class="mt-1.5 text-[10px] inline-flex px-1.5 py-0.5 rounded border"
                            :class="settings.readingMode === mode.value ? 'bg-blue-100/50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50'">
                            {{ mode.hint }}
                        </div>
                    </div>

                    <!-- Checkmark -->
                    <div v-if="settings.readingMode === mode.value"
                        class="ml-3 text-blue-600 dark:text-blue-400 shrink-0">
                        <IconCheckMark class="size-5" />
                    </div>
                </button>
            </div>

            <!-- Mouse Instruction Box -->
            <div
                class="mt-3 px-3 py-2.5 rounded-lg bg-manga-50 dark:bg-manga-900/40 border border-manga-100 dark:border-manga-700/50 text-xs text-manga-600 dark:text-manga-400">
                <div class="font-bold mb-1.5 flex items-center gap-1.5 text-manga-700 dark:text-manga-300">
                    气泡操作
                </div>
                <div class="space-y-1">
                    <div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        <span class="opacity-80">左键单击：</span> 切换 <span
                            class="font-medium text-manga-800 dark:text-manga-200">原文 / 译文</span>
                    </div>
                    <div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                        <span class="opacity-80">双击气泡：</span> 重新进行 <span
                            class="font-medium text-manga-800 dark:text-manga-200">OCR 识别</span>
                    </div>
                    <div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> <span
                            class="opacity-80">右键点击：</span> <span
                            class="font-medium text-red-600 dark:text-red-400">删除</span> 选中文本框</div>
                </div>
            </div>
        </section>

        <div>
            <h3 class="text-lg font-bold text-manga-900 dark:text-white">常规设置</h3>
            <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">控制软件的基础功能与外观</p>
        </div>

        <div class="space-y-4">
            <h4 class="text-xs font-semibold text-manga-400 uppercase tracking-wider">核心功能</h4>

            <div
                class="flex items-center justify-between p-4 rounded-lg border border-manga-100 dark:border-manga-700 bg-manga-50 dark:bg-manga-900/50">
                <div>
                    <div class="font-medium text-manga-900 dark:text-manga-200">启用分词</div>
                    <div class="text-xs text-manga-500">对识别结果进行日语分词处理</div>
                </div>
                <!-- 简单的 Toggle 开关样式 -->
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" v-model="settings.enableTokenization" @change="saveSettings"
                        class="sr-only peer">
                    <div
                        class="w-11 h-6 bg-manga-200 peer-focus:outline-none rounded-full peer dark:bg-manga-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600">
                    </div>
                </label>
            </div>

            <div
                class="flex items-center justify-between p-4 rounded-lg border border-manga-100 dark:border-manga-700 bg-manga-50 dark:bg-manga-900/50">
                <div>
                    <div class="font-medium text-manga-900 dark:text-manga-200">启用翻译</div>
                    <div class="text-xs text-manga-500">开启后将加载本地 LLM 模型</div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" v-model="settings.enableTranslation" @change="saveSettings"
                        class="sr-only peer">
                    <div
                        class="w-11 h-6 bg-manga-200 peer-focus:outline-none rounded-full peer dark:bg-manga-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600">
                    </div>
                </label>
            </div>
        </div>

        <!-- 快捷键设置区域 -->
        <div class="space-y-4">
            <h4 class="text-xs font-semibold text-manga-400 uppercase tracking-wider">全局快捷键</h4>

            <!-- OCR 截图 -->
            <div>
                <label class="text-xs text-manga-500 mb-1 block">OCR 截图</label>
                <div class="relative group">
                    <input type="text" readonly
                        :value="(isRecording && recordingTarget === 'ocrShortcut') ? (settings.ocrShortcut || '请按下按键...') : (settings.ocrShortcut || '未设置')"
                        @click="startRecording('ocrShortcut')" @keydown="handleKeyDown" @blur="stopRecording"
                        class="w-full px-4 py-3 rounded-lg text-sm font-mono text-center cursor-pointer transition-all border outline-none"
                        :class="[
                            (isRecording && recordingTarget === 'ocrShortcut')
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400 shadow-inner'
                                : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 text-manga-600 dark:text-manga-300 hover:border-manga-400'
                        ]" />
                    <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <span v-if="isRecording && recordingTarget === 'ocrShortcut'" class="flex h-3 w-3 relative">
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                        <span v-else
                            class="text-xs text-manga-400 bg-manga-100 dark:bg-manga-800 px-2 py-1 rounded">点击录制</span>
                    </div>
                </div>
            </div>

            <!-- 上一张图片 -->
            <div>
                <label class="text-xs text-manga-500 mb-1 block">上一张图片</label>
                <div class="relative group">
                    <input type="text" readonly
                        :value="(isRecording && recordingTarget === 'prevImageShortcut') ? (settings.prevImageShortcut || '请按下按键...') : (settings.prevImageShortcut || '未设置')"
                        @click="startRecording('prevImageShortcut')" @keydown="handleKeyDown" @blur="stopRecording"
                        class="w-full px-4 py-3 rounded-lg text-sm font-mono text-center cursor-pointer transition-all border outline-none"
                        :class="[
                            (isRecording && recordingTarget === 'prevImageShortcut')
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400 shadow-inner'
                                : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 text-manga-600 dark:text-manga-300 hover:border-manga-400'
                        ]" />
                    <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <span v-if="isRecording && recordingTarget === 'prevImageShortcut'"
                            class="flex h-3 w-3 relative">
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                        <span v-else
                            class="text-xs text-manga-400 bg-manga-100 dark:bg-manga-800 px-2 py-1 rounded">点击录制</span>
                    </div>
                </div>
            </div>

            <!-- 下一张图片 -->
            <div>
                <label class="text-xs text-manga-500 mb-1 block">下一张图片</label>
                <div class="relative group">
                    <input type="text" readonly
                        :value="(isRecording && recordingTarget === 'nextImageShortcut') ? (settings.nextImageShortcut || '请按下按键...') : (settings.nextImageShortcut || '未设置')"
                        @click="startRecording('nextImageShortcut')" @keydown="handleKeyDown" @blur="stopRecording"
                        class="w-full px-4 py-3 rounded-lg text-sm font-mono text-center cursor-pointer transition-all border outline-none"
                        :class="[
                            (isRecording && recordingTarget === 'nextImageShortcut')
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400 shadow-inner'
                                : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 text-manga-600 dark:text-manga-300 hover:border-manga-400'
                        ]" />
                    <div class="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                        <span v-if="isRecording && recordingTarget === 'nextImageShortcut'"
                            class="flex h-3 w-3 relative">
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                        </span>
                        <span v-else
                            class="text-xs text-manga-400 bg-manga-100 dark:bg-manga-800 px-2 py-1 rounded">点击录制</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 主题外观 -->
        <div class="space-y-4">
            <h4 class="text-xs font-semibold text-manga-400 uppercase tracking-wider">外观</h4>
            <div class="grid grid-cols-3 gap-3">
                <button v-for="mode in themeOptions" :key="mode" @click="settings.theme = mode; saveSettings()"
                    class="flex flex-col items-center justify-center py-3 px-2 rounded-lg border transition-all cursor-pointer"
                    :class="[
                        settings.theme === mode
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 text-manga-500 hover:bg-manga-50 dark:hover:bg-manga-800'
                    ]">
                    <!-- 简单的图标示意 -->
                    <span class="text-xl mb-1">
                        {{ mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '💻' }}
                    </span>
                    <span class="text-xs font-medium">
                        {{ mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统' }}
                    </span>
                </button>
            </div>
        </div>
    </div>
</template>
