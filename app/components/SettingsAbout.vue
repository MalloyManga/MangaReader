<!-- components/settings/SettingsAbout.vue -->
<script setup lang="ts">
const config = {
    appName: 'Manga Reader',
    appVersion: 'v1.0.1',
    appDescription: '专为日语学习者打造的离线漫画阅读与翻译工具。',
    projectGithub: 'https://github.com/MalloyManga/MangaReader',
    developerName: 'Malloy',
    personalGithub: 'https://github.com/MalloyManga',
    portfolioWebsite: 'https://malloymanga.github.io/',
    currentYear: new Date().getFullYear(),
}

// 技术栈列表
const techStack = [
    { name: 'Electron', url: 'https://www.electronjs.org/', color: 'text-blue-500' },
    { name: 'Nuxt4', url: 'https://nuxt.com/', color: 'text-green-500' },
    { name: 'Tailwind CSS', url: 'https://tailwindcss.com/', color: 'text-cyan-400' },
    { name: 'Manga OCR', url: 'https://github.com/kha-white/manga-ocr', color: 'text-red-400' },
    { name: 'Sakura LLM', url: 'https://github.com/SakuraLLM/SakuraLLM', color: 'text-pink-400' },
    { name: 'SudachiPy', url: 'https://github.com/WorksApplications/SudachiPy', color: 'text-yellow-500' },
]

const openLink = (url: string) => {
    if (!window.electronAPI) {
        window.open(url, '_blank', 'noopener,noreferrer')
        return
    }
    window.electronAPI.openLink(url)
}
</script>

<template>
    <div class="h-full flex flex-col items-center text-center animate-fade-in space-y-8 pt-4">

        <!-- App 头部 -->
        <div class="space-y-3">
            <div
                class="w-16 h-16 mx-auto bg-linear-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 overflow-hidden">
                <img src="/MangaReaderLogo.png" alt="logo" class="w-full h-full object-cover">
            </div>
            <div>
                <h2 class="text-xl font-bold text-manga-900 dark:text-white">{{ config.appName }}</h2>
                <div class="flex items-center justify-center gap-2 mt-2">
                    <span class="px-2 py-0.5 rounded text-xs font-mono bg-manga-100 dark:bg-manga-800 text-manga-500">
                        {{ config.appVersion }}
                    </span>
                    <button @click="openLink(config.projectGithub)" title="View Source Code"
                        class="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium text-manga-500 hover:text-blue-600 dark:text-manga-400 dark:hover:text-white bg-transparent hover:bg-blue-50 dark:hover:bg-manga-700 transition-all cursor-pointer border border-transparent hover:border-blue-100 dark:hover:border-manga-600">
                        <IconGithub class="size-3.5" />
                        <span>GPL v3</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 开发者卡片 -->
        <div
            class="w-full max-w-sm bg-manga-50 dark:bg-manga-900/40 border border-manga-100 dark:border-manga-700/50 rounded-xl p-3 flex items-center justify-between">
            <div class="flex items-center gap-3 text-left">
                <div
                    class="w-9 h-9 rounded-full bg-white dark:bg-manga-800 flex items-center justify-center border border-manga-200 dark:border-manga-700 text-base">
                    👨‍💻
                </div>
                <div>
                    <div class="text-[10px] text-manga-400 uppercase font-bold">Developed by</div>
                    <div class="font-bold text-sm text-manga-900 dark:text-white">{{ config.developerName }}</div>
                </div>
            </div>

            <!-- 个人网站 + 个人 GitHub -->
            <div class="flex gap-1">
                <button @click="openLink(config.portfolioWebsite)" title="Personal Website"
                    class="p-1.5 rounded-lg text-manga-400 hover:text-blue-500 hover:bg-white dark:hover:bg-manga-700 transition-all cursor-pointer">
                    <IconWebsite class="size-4" />
                </button>
                <button @click="openLink(config.personalGithub)" title="Personal GitHub"
                    class="p-1.5 rounded-lg text-manga-400 hover:text-black dark:hover:text-white hover:bg-white dark:hover:bg-manga-700 transition-all cursor-pointer">
                    <IconGithub class="size-4" />
                </button>
            </div>
        </div>

        <!-- 技术致谢 (Tech Stack) -->
        <div class="w-full pt-6 border-t border-manga-100 dark:border-manga-700">
            <h3 class="text-xs font-semibold text-manga-400 uppercase tracking-widest mb-4">
                Powered By
            </h3>

            <div class="grid grid-cols-2 gap-3">
                <button v-for="tech in techStack" :key="tech.name" @click="openLink(tech.url)"
                    class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-manga-800 border border-manga-100 dark:border-manga-700 hover:border-manga-300 dark:hover:border-manga-500 hover:shadow-sm transition-all cursor-pointer group text-left">

                    <!-- 内嵌简单 SVG 图标 -->
                    <div class="size-5 flex items-center justify-center">
                        <IconTechStack class="size-4 transition-transform group-hover:scale-110" :class="tech.color" />
                    </div>

                    <span
                        class="text-xs font-medium text-manga-600 dark:text-manga-300 group-hover:text-manga-900 dark:group-hover:text-white">
                        {{ tech.name }}
                    </span>
                </button>
            </div>
        </div>

        <!-- 4. 底部版权 -->
        <div class="mt-auto pb-4 text-xs text-manga-400 flex flex-col gap-1">
            <p>Copyright © {{ config.currentYear }} {{ config.developerName }}.</p>
            <p>Released under the MIT License.</p>
        </div>
    </div>
</template>
