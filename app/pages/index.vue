<!-- app/pages/index.vue -->
<script setup lang="ts">
// 原文显示板块 使用 v-model 双向绑定
const originalText = ref('今日はいい天気ですね。漫画を読みながら日本語を勉強します。')
</script>

<template>
    <div class="min-h-screen bg-manga-50 dark:bg-manga-700">
        <header class="px-6 py-4 border-b border-manga-200 dark:border-manga-600 bg-manga-100 dark:bg-manga-800">
            <Nav />
        </header>

        <main class="max-w-screen-2xl mx-auto p-6">
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 h-[calc(100vh-120px)]">
                <div class="lg:col-span-3">
                    <ImageUpload />
                </div>

                <div class="lg:col-span-2 space-y-4">
                    <OriginalText v-model:local-text="originalText" />
                    <!-- 这里indexvue起到一个父组件传递originalText的作用 v-model 传递给originalText再传递给Translationvue -->
                    <TokenizedWords :origin-text="originalText" />
                    <Translation :original-text="originalText" />
                    <HintCard text="提示：点击分词结果中的单词可查看详情" />
                </div>
            </div>
        </main>
    </div>
</template>
