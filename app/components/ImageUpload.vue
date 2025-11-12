<!-- components/ImageUpload.vue -->
<script setup lang="ts">

const handleImageUpload = () => { console.log(`handleImageUpload`) }
const handleScreenshot = () => { console.log(`handleScreenshot`) }
</script>

<template>
    <div
        class="p-4 transition-all duration-200 shadow-base border border-manga-200 dark:border-manga-500 rounded-primary hover:shadow-card hover:-translate-y-0.5 h-full flex items-center justify-center bg-manga-50 dark:bg-manga-700">
        <div class="text-center">
            <div class="text-6xl mb-4">🖼️</div>
            <p class="text-lg mb-2 text-manga-900 dark:text-manga-100">图片预览区域</p>
            <p class="text-sm mb-6 text-manga-600 dark:text-manga-400">拖拽图片到此处</p>
            <div class="flex gap-3 justify-center">
                <Button @click="handleImageUpload">📁 选择图片</Button>
                <Button variant="secondary" @click="handleScreenshot">✂️ 截图</Button>
            </div>
        </div>
    </div>

</template>
