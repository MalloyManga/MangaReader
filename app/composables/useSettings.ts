// composables/useSettings.ts
export type ThemeOption = 'system' | 'light' | 'dark'

export const useSettings = () => {
    // 这里存放具体的设置数据
    const settings = useState('app-settings', () => ({
        readingMode: 'study' as 'study' | 'list' | 'immersive',
        enableTranslation: false, // 启用翻译
        enableTokenization: true, // 启用分词
        translationApiKey: '', // 翻译APIkey
        theme: 'system' as ThemeOption, // 默认为跟随系统
        ocrShortcut: '',
        prevImageShortcut: '',
        nextImageShortcut: ''
    }))

    const applyTheme = () => {
        if (!import.meta.client) return

        const html = document.documentElement
        const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches

        let shouldBeDark = false

        if (settings.value.theme === 'system') {
            shouldBeDark = isDarkSystem
        } else {
            shouldBeDark = settings.value.theme === 'dark'
        }

        if (shouldBeDark) {
            html.classList.add('dark')
        } else {
            html.classList.remove('dark')
        }
    }

    if (import.meta.client) {
        // 监听 settings 变化，自动同步到 Electron Store
        watch(settings, (newVal) => {
            try {
                applyTheme()
                if (!window.electronAPI) return

                // [Fix] 使用 JSON 序列化/反序列化彻底去除 Proxy 包装
                // 解决 "An object could not be cloned" 报错
                const rawSettings = JSON.parse(JSON.stringify(newVal))

                // 遍历保存每一个 key
                for (const [key, value] of Object.entries(rawSettings)) {
                    // 注意：这里需要确保 saveSetting 存在，防止 SSR 报错
                    window.electronAPI?.saveSetting(key, value)
                }

                // 批量更新所有快捷键
                window.electronAPI.updateShortcuts({
                    ocr: rawSettings.ocrShortcut,
                    prev: rawSettings.prevImageShortcut || '',
                    next: rawSettings.nextImageShortcut || ''
                })
            } catch (e) {
                console.error('Auto-save settings failed:', e)
            }

        }, { deep: true })

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        mediaQuery.addEventListener('change', () => {
            if (settings.value.theme === 'system') applyTheme()
        })
    }

    // 打开模型文件夹 (调用 Electron)
    const openModelFolder = () => {
        if (import.meta.client) {
            window.electronAPI?.send('open-model-folder')
        }
    }

    // 保存设置 (持久化到 localStorage 或 electron-store)
    const saveSettings = () => {
        console.log('设置已通过 Watch 自动保存')
    }

    // 初始化：从 Electron 读取配置
    const initSettings = async () => {
        if (import.meta.client) {

            if (!window.electronAPI) {
                console.warn('Electron API not available')
                applyTheme()
                return
            }
            try {
                const storedSettings = await window.electronAPI.getSettings()
                // 合并配置：用 store 里的覆盖默认值
                Object.assign(settings.value, storedSettings)
                // 初始化完成后立即应用一次主题
                applyTheme()

                // 初始化所有快捷键
                window.electronAPI.updateShortcuts({
                    ocr: settings.value.ocrShortcut,
                    prev: settings.value.prevImageShortcut || '',
                    next: settings.value.nextImageShortcut || ''
                })

                console.log('⚙️ Settings loaded from Electron Store')
            } catch (e) {
                console.error('Failed to load settings:', e)
            }
        }
    }

    return {
        settings,
        applyTheme,
        openModelFolder,
        saveSettings,
        initSettings
    }
}
