<!-- app/pages/index.vue -->
<script setup lang="ts">
const isDark = ref(false)

const toggleDark = () => {
    isDark.value = !isDark.value
    document.documentElement.classList.toggle('dark')
}

onMounted(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
        isDark.value = true
        document.documentElement.classList.add('dark')
    }
})

const originalText = ref('今日はいい天気ですね。漫画を読みながら日本語を勉強します。')
const tokens = ref([
    { word: '今日', type: 'noun' as const },
    { word: 'は', type: 'particle' as const },
    { word: 'いい', type: 'adjective' as const },
    { word: '天気', type: 'noun' as const },
    { word: 'です', type: 'verb' as const },
    { word: 'ね', type: 'particle' as const },
])

const translatedText = ref('今天天气真好呢。一边看漫画一边学习日语。')
const isTranslating = ref(false)

const handleTextUpdate = (text: string) => {
    originalText.value = text
}

const handleTranslate = async () => {
    isTranslating.value = true
    setTimeout(() => {
        translatedText.value = '今天天气真好呢。一边看漫画一边学习日语。'
        isTranslating.value = false
    }, 1000)
}

const handleImageUpload = () => console.log('打开文件选择器')
const handleScreenshot = () => console.log('开始截图')
const handleSettings = () => console.log('打开设置')
const handleVocabulary = () => console.log('打开生词本')
</script>

<template>
    <div class="min-h-screen" style="background-color: var(--bg-primary);">
        <header class="px-6 py-4 border-b"
            style="border-color: var(--border-color); background-color: var(--bg-secondary);">
            <div class="flex items-center justify-between max-w-screen-2xl mx-auto">
                <div class="flex items-center gap-6">
                    <h1 class="text-2xl font-bold" style="color: var(--text-primary);">📚 MangaReader</h1>
                </div>
                <div class="flex items-center gap-3">
                    <Button variant="secondary" size="sm" @click="handleVocabulary">📖 生词本</Button>
                    <Button variant="secondary" size="sm" @click="handleSettings">⚙️ 设置</Button>
                    <Button size="sm" @click="toggleDark">{{ isDark ? '☀️' : '🌙' }}</Button>
                </div>
            </div>
        </header>

        <main class="max-w-screen-2xl mx-auto p-6">
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-120px)]">
                <div class="lg:col-span-3">
                    <div class="card-manga h-full flex items-center justify-center"
                        style="background-color: var(--bg-primary);">
                        <div class="text-center">
                            <div class="text-6xl mb-4">🖼️</div>
                            <p class="text-lg mb-2" style="color: var(--text-primary);">图片预览区域</p>
                            <p class="text-sm mb-6" style="color: var(--text-secondary);">拖拽图片到此处</p>
                            <div class="flex gap-3 justify-center">
                                <Button @click="handleImageUpload">📁 选择图片</Button>
                                <Button variant="secondary" @click="handleScreenshot">✂️ 截图</Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-2 space-y-4 overflow-y-auto">
                    <OriginalText :text="originalText" @update="handleTextUpdate" />
                    <TokenizedWords :tokens="tokens" />
                    <Translation :original-text="originalText" :translated-text="translatedText"
                        :is-loading="isTranslating" @translate="handleTranslate" />
                    <div class="card-manga p-4">
                        <p class="text-xs" style="color: var(--text-secondary);">
                            💡 提示：点击分词结果中的单词可查看详情
                        </p>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
.overflow-y-auto {
    scrollbar-width: thin;
}

.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background-color: var(--color-manga-300);
    border-radius: 3px;
}
</style>