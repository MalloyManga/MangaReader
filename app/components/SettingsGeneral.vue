<!-- components/SettingsGeneral.vue -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { settings, saveSettings } = useSettings()
const { showToast } = useToast()
const { selectedModel, checkAllModelStatus } = useModelStatus()
const { dictionary, checkDictionaryStatus } = useDictionaryStatus()

const themeOptions = computed<Record<ThemeOption, {
    icon: string,
    desc: string
}>>(() => ({
    'light': { icon: '☀️', desc: t('general.themeLight') },
    'dark': { icon: '🌙', desc: t('general.themeDark') },
    'system': { icon: '💻', desc: t('general.themeSystem') }
}))

const isRecording = ref(false)
const showDeleteDictionaryModal = ref(false)
const isDeletingDictionary = ref(false)
let cleanupDictionaryProgress: (() => void) | null = null
// 记录当前正在录制哪个快捷键
const recordingTarget = ref<'ocrShortcut' | 'prevImageShortcut' | 'nextImageShortcut' | null>(null)

const modeOptions = computed(() => [
    {
        mode: 'study',
        label: t('general.studyMode'),
        desc: t('general.studyModeDesc'),
        hint: ''
    },
    {
        mode: 'list',
        label: t('general.listMode'),
        desc: t('general.listModeDesc'),
        hint: t('general.ocrShortcutHint')
    },
    {
        mode: 'immersive',
        label: t('general.immersiveMode'),
        desc: t('general.immersiveModeDesc'),
        hint: t('general.ocrShortcutRequired')
    }
])

// 判断模型是否不可用 study模式默认可用 (翻译)模型未下载时为不可用 true
const isModeDisabled = (modeValue: string) => {
    if (modeValue === 'study') return false
    return selectedModel.value?.status !== 'downloaded'
}

const handleModeClick = (modeValue: any) => {
    if (isModeDisabled(modeValue)) {
        showToast(t('general.translationModelRequired'))
        return
    }
    settings.value.readingMode = modeValue
    saveSettings()
}

// 快捷键录制逻辑部分
const startRecording = (target: 'ocrShortcut' | 'prevImageShortcut' | 'nextImageShortcut') => {
    isRecording.value = true
    recordingTarget.value = target
    showToast(t('general.recordShortcutHint'), 3000)
}

const handleKeyDown = (e: KeyboardEvent) => {
    if (!isRecording.value || !recordingTarget.value) return
    e.preventDefault()
    e.stopPropagation()

    // esc退出录制 enter确认 backspace清除
    if (e.key === 'Escape') {
        stopRecording();
        // e.target 为 EventTarget 类型 不存在方法blur 但实际上这里不会出现除了 HTMLElement 以外的情况 故断言为
        (e.target as HTMLElement).blur()
        return
    }
    else if (e.key === 'Enter') {
        saveSettings()
        stopRecording();
        (e.target as HTMLElement).blur()
        return
    }
    else if (e.key === 'Backspace') {
        if (recordingTarget.value) {
            settings.value[recordingTarget.value] = ''
        }
        // 清空后立即保存并退出录制
        saveSettings()
        stopRecording();
        (e.target as HTMLElement).blur()
        showToast(t('general.shortcutCleared'), 1500)
        return
    }

    // 按下按键的每一帧进行处理
    const keys = []
    if (e.ctrlKey) keys.push('Ctrl')
    if (e.metaKey) keys.push('Cmd')
    if (e.altKey) keys.push('Alt')
    if (e.shiftKey) keys.push('Shift')
    const specialKeys = ['Control', 'Meta', 'Alt', 'Shift']
    if (!specialKeys.includes(e.key)) {
        // 排除特殊按键以便对其他按键(字母数字)做特殊处理
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


const stopRecording = () => {
    isRecording.value = false
    recordingTarget.value = null
    // 移除 ref 操作，依赖原生 focus/blur 行为即可
}

const handleDownloadDictionary = async () => {
    if (dictionary.status === 'downloading') return
    dictionary.status = 'downloading'
    dictionary.progress = 0

    try {
        const res = await window.electronAPI.downloadDictionary()

        if (res.success) {
            dictionary.progress = 100
            dictionary.status = 'downloaded'
        } else {
            showToast(`${t('general.downloadFailed')}: ${res.error}`)
            dictionary.status = 'not_downloaded'
        }
    } catch (e) {
        dictionary.status = 'not_downloaded'
        showToast(t('general.downloadError'))
    }
}

const confirmDeleteDictionary = async () => {
    isDeletingDictionary.value = true
    try {
        const res = await window.electronAPI.deleteDictionary()
        if (res.success) {
            dictionary.status = 'not_downloaded'
            dictionary.progress = 0
            showDeleteDictionaryModal.value = false
        } else {
            showToast(t('general.deleteFailed'))
        }
    } catch (e) {
        showToast(t('general.deleteError'))
    } finally {
        isDeletingDictionary.value = false
    }
}

onMounted(() => {
    checkAllModelStatus()
    checkDictionaryStatus()

    if (window.electronAPI?.onDictionaryDownloadProgress) {
        cleanupDictionaryProgress = window.electronAPI.onDictionaryDownloadProgress((percent: number) => {
            if (dictionary.status === 'downloading') {
                dictionary.progress = percent

                if (percent >= 100) {
                    dictionary.status = 'downloaded'
                }
            }
        })
    }
})

onUnmounted(() => {
    cleanupDictionaryProgress?.()
})
</script>

<template>
    <div class="space-y-8 animate-fade-in">

        <section>
            <!-- 阅读模式设置部分 -->
            <h3 class="text-lg font-bold text-manga-900 dark:text-white mb-3">{{ t('general.readingMode') }}</h3>
            <div class="flex flex-col gap-3">
                <button v-for="modeOption in modeOptions" :key="modeOption.mode"
                    @click="handleModeClick(modeOption.mode)"
                    class="flex items-center text-left w-full p-3 rounded-xl border transition-all cursor-pointer group relative overflow-hidden"
                    :class="[
                        settings.readingMode === modeOption.mode
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 ring-1 ring-blue-200 dark:ring-blue-800'
                            : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 hover:bg-manga-50 dark:hover:bg-manga-800',
                        isModeDisabled(modeOption.mode) ? 'opacity-60 cursor-not-allowed grayscale' : ''
                    ]">

                    <!-- Disabled overlay / hint -->
                    <div v-if="isModeDisabled(modeOption.mode)"
                        class="absolute inset-0 z-10 bg-white/50 dark:bg-black/50 flex items-center justify-center backdrop-blur-[1px]">
                        <span
                            class="bg-black/75 text-white text-[10px] px-2 py-1 rounded-full font-medium tracking-wide shadow-sm">
                            {{ t('general.translationModelRequiredShort') }}
                        </span>
                    </div>

                    <div class="mr-3 p-2 rounded-lg shrink-0"
                        :class="settings.readingMode === modeOption.mode ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200' : 'bg-manga-100 dark:bg-manga-800 text-manga-500'">
                        <IconBook v-if="modeOption.mode === 'study'" class="size-5" />
                        <IconChatBubble v-if="modeOption.mode === 'list'" class="size-5" />
                        <IconFullScreen v-if="modeOption.mode === 'immersive'" class="size-5" />
                    </div>

                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-0.5">
                            <div class="font-bold text-sm"
                                :class="settings.readingMode === modeOption.mode ? 'text-blue-700 dark:text-blue-300' : 'text-manga-900 dark:text-gray-200'">
                                {{ modeOption.label }}
                            </div>
                        </div>
                        <div class="text-xs leading-relaxed"
                            :class="settings.readingMode === modeOption.mode ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-manga-500 dark:text-gray-400'">
                            {{ modeOption.desc }}
                        </div>
                        <div v-if="modeOption.hint" class="mt-1.5 text-[10px] inline-flex px-1.5 py-0.5 rounded border"
                            :class="settings.readingMode === modeOption.mode ? 'bg-blue-100/50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-500 dark:border-amber-800/50'">
                            {{ modeOption.hint }}
                        </div>
                    </div>

                    <!-- Checkmark -->
                    <div v-if="settings.readingMode === modeOption.mode"
                        class="ml-3 text-blue-600 dark:text-blue-400 shrink-0">
                        <IconCheckMark class="size-5" />
                    </div>
                </button>
            </div>
            <!-- ------------------------------ -->

            <!-- 鼠标操作提示栏 -->
            <div
                class="mt-3 px-3 py-2.5 rounded-lg bg-manga-50 dark:bg-manga-900/40 border border-manga-100 dark:border-manga-700/50 text-xs text-manga-600 dark:text-manga-400">
                <div class="font-bold mb-1.5 flex items-center gap-1.5 text-manga-700 dark:text-manga-300">
                    {{ t('general.bubbleControls') }}
                </div>
                <div class="space-y-1">
                    <div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        <span class="opacity-80">{{ t('general.leftClick') }}：</span> {{ t('general.toggle') }} <span
                            class="font-medium text-manga-800 dark:text-manga-200">{{ t('general.originalTranslation') }}</span>
                    </div>
                    <div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                        <span class="opacity-80">{{ t('general.doubleClickBubble') }}：</span> {{ t('general.runAgain') }} <span
                            class="font-medium text-manga-800 dark:text-manga-200">OCR {{ t('general.recognition') }}</span>
                    </div>
                    <div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> <span
                            class="opacity-80">{{ t('general.rightClick') }}：</span> <span
                            class="font-medium text-red-600 dark:text-red-400">{{ t('common.delete') }}</span> {{ t('general.selectedTextBox') }}</div>
                </div>
            </div>
        </section>

        <div>
            <h3 class="text-lg font-bold text-manga-900 dark:text-white">{{ t('general.title') }}</h3>
            <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">{{ t('general.description') }}</p>
        </div>

        <div class="space-y-4">
            <h4 class="text-xs font-semibold text-manga-400 uppercase tracking-wider">{{ t('general.coreFeatures') }}</h4>

            <div class="p-4 rounded-lg border border-manga-100 dark:border-manga-700 bg-manga-50 dark:bg-manga-900/50">
                <div class="mb-3">
                    <div class="font-medium text-manga-900 dark:text-manga-200">{{ t('general.downloadSource') }}</div>
                    <div class="text-xs text-manga-500">{{ t('general.downloadSourceDesc') }}</div>
                </div>
                <div class="grid grid-cols-2 rounded-lg bg-manga-200/70 dark:bg-manga-700 p-1" role="radiogroup"
                    :aria-label="t('general.downloadSource')">
                    <button v-for="source in ([
                        { id: 'mirror', label: t('general.mirrorSource') },
                        { id: 'official', label: t('general.officialSource') }
                    ] as const)" :key="source.id" type="button" role="radio"
                        :aria-checked="settings.downloadSource === source.id"
                        class="h-9 text-sm font-medium rounded-md transition-colors cursor-pointer"
                        :class="settings.downloadSource === source.id
                            ? 'bg-white dark:bg-manga-900 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-manga-500 dark:text-manga-400 hover:text-manga-800 dark:hover:text-manga-200'"
                        @click="settings.downloadSource = source.id; saveSettings()">
                        {{ source.label }}
                    </button>
                </div>
            </div>

            <div
                class="flex items-center justify-between p-4 rounded-lg border border-manga-100 dark:border-manga-700 bg-manga-50 dark:bg-manga-900/50">
                <div>
                    <div class="font-medium text-manga-900 dark:text-manga-200">{{ t('general.enableTokenization') }}</div>
                    <div class="text-xs text-manga-500">{{ t('general.enableTokenizationDesc') }}</div>
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
                class="flex items-center justify-between p-3 rounded-lg border border-manga-100 dark:border-manga-700 bg-white dark:bg-manga-900">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="font-medium text-sm text-manga-900 dark:text-manga-200 truncate">
                        {{ dictionary.name }}
                    </div>
                    <span
                        class="px-2 py-0.5 rounded text-[10px] font-bold bg-manga-100 dark:bg-manga-800 text-manga-600 dark:text-manga-400 shrink-0">
                        {{ dictionary.size }}
                    </span>
                </div>

                <div class="flex items-center gap-3 shrink-0">
                    <div v-if="dictionary.status === 'checking'" class="text-xs text-manga-400">
                        {{ t('general.checking') }}
                    </div>

                    <div v-else-if="dictionary.status === 'downloaded'" class="flex items-center gap-1">
                        <span class="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <IconSuccess class="size-4" />
                            {{ t('general.ready') }}
                        </span>
                        <button @click="showDeleteDictionaryModal = true" :title="t('general.deleteDictionary')"
                            class="flex items-center justify-center w-8 h-8 text-manga-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all cursor-pointer">
                            <IconTresh class="size-5" />
                        </button>
                    </div>

                    <div v-else-if="dictionary.status === 'downloading'" class="w-28">
                        <div class="flex justify-between text-xs text-manga-500 mb-1">
                            <span>{{ t('general.downloading') }}</span>
                            <span>{{ Math.round(dictionary.progress) }}%</span>
                        </div>
                        <div class="w-full bg-manga-100 dark:bg-manga-700 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                                :style="{ width: dictionary.progress + '%' }"></div>
                        </div>
                    </div>

                    <button v-else @click="handleDownloadDictionary"
                        class="flex items-center gap-1.5 px-3 py-1.5 bg-manga-900 dark:bg-manga-700 hover:bg-blue-600 dark:hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap">
                        <IconDownload class="size-4" />
                        {{ t('common.download') }}
                    </button>
                </div>
            </div>

            <div
                class="flex items-center justify-between p-4 rounded-lg border border-manga-100 dark:border-manga-700 bg-manga-50 dark:bg-manga-900/50">
                <div>
                    <div class="font-medium text-manga-900 dark:text-manga-200">{{ t('general.enableTranslation') }}</div>
                    <div class="text-xs text-manga-500">{{ t('general.enableTranslationDesc') }}</div>
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
            <h4 class="text-xs font-semibold text-manga-400 uppercase tracking-wider">{{ t('general.globalShortcuts') }}</h4>

            <!-- OCR 截图 -->
            <div>
                <label class="text-xs text-manga-500 mb-1 block">{{ t('general.ocrCapture') }}</label>
                <div class="relative group">
                    <!-- 判断 只有正在录制并且录制的为ocr快捷键true 才会显示设置的快捷键或者提示文本 false时显示已经设置的快捷键或者提示文本 即保证总是显示快捷键 -->
                    <input type="text" readonly
                        :value="(isRecording && recordingTarget === 'ocrShortcut') ? (settings.ocrShortcut || t('general.pressKey')) : (settings.ocrShortcut || t('general.notSet'))"
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
                            class="text-xs text-manga-400 bg-manga-100 dark:bg-manga-800 px-2 py-1 rounded">{{ t('general.clickToRecord') }}</span>
                    </div>
                </div>
            </div>

            <!-- 上一张图片 -->
            <div>
                <label class="text-xs text-manga-500 mb-1 block">{{ t('general.previousImage') }}</label>
                <div class="relative group">
                    <input type="text" readonly
                        :value="(isRecording && recordingTarget === 'prevImageShortcut') ? (settings.prevImageShortcut || t('general.pressKey')) : (settings.prevImageShortcut || t('general.notSet'))"
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
                            class="text-xs text-manga-400 bg-manga-100 dark:bg-manga-800 px-2 py-1 rounded">{{ t('general.clickToRecord') }}</span>
                    </div>
                </div>
            </div>

            <!-- 下一张图片 -->
            <div>
                <label class="text-xs text-manga-500 mb-1 block">{{ t('general.nextImage') }}</label>
                <div class="relative group">
                    <input type="text" readonly
                        :value="(isRecording && recordingTarget === 'nextImageShortcut') ? (settings.nextImageShortcut || t('general.pressKey')) : (settings.nextImageShortcut || t('general.notSet'))"
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
                            class="text-xs text-manga-400 bg-manga-100 dark:bg-manga-800 px-2 py-1 rounded">{{ t('general.clickToRecord') }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 主题外观 -->
        <div class="space-y-4">
            <h4 class="text-xs font-semibold text-manga-400 uppercase tracking-wider">{{ t('general.appearance') }}</h4>
            <div class="grid grid-cols-3 gap-3">
                <button v-for="(theme, themeId) in themeOptions" :key="themeId"
                    @click="settings.theme = themeId; saveSettings()"
                    class="flex flex-col items-center justify-center py-3 px-2 rounded-lg border transition-all cursor-pointer"
                    :class="[
                        settings.theme === themeId
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                            : 'bg-white dark:bg-manga-900 border-manga-200 dark:border-manga-700 text-manga-500 hover:bg-manga-50 dark:hover:bg-manga-800'
                    ]">
                    <!-- 简单的图标示意 -->
                    <span class="text-xl mb-1">
                        <!-- {{ mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '💻' }} -->
                        {{ theme.icon }}
                    </span>
                    <span class="text-xs font-medium">
                        <!-- {{ mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统' }} -->
                        {{ theme.desc }}
                    </span>
                </button>
            </div>
        </div>

        <ConfirmModal :show="showDeleteDictionaryModal" :title="t('general.deleteDictionaryConfirm')"
            :content="t('general.deleteDictionaryContent', { name: dictionary.name, size: dictionary.size })" :confirm-text="t('common.confirmDelete')"
            :is-danger="true" :loading="isDeletingDictionary" @cancel="showDeleteDictionaryModal = false"
            @confirm="confirmDeleteDictionary" />
    </div>
</template>
