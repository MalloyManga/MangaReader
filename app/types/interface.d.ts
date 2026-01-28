// types/electron.d.ts
export interface Token {
    word: string
    type: 'noun' | 'verb' | 'particle' | 'adjective' | 'other'
    reading?: string
    dictionary_form?: string
}

// 定义设置对象的接口
export interface AppSettings {
    enableTranslation: boolean
    enableTokenization: boolean
    translationApiKey: string
    theme: 'system' | 'light' | 'dark'
    ocrShortcut: string
    prevImageShortcut?: string
    nextImageShortcut?: string
    [key: string]: any
}

export interface ImageItem {
    id: string
    url: string
    file: File
    type: 'image' | 'pdf-page'
    pageNumber?: number
}

export interface Book {
    id: string
    path: string
    cover: string | null // Base64 Data URL
    totalPage: number
    currentPage: number
    lastReadTime: number
}

export interface IElectronAPI {
    // 基础通信
    send: (channel: string, data?: any) => void
    on: (channel: string, func: (...args: any[]) => void) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>

    // Library
    getLibrary: () => Promise<Book[]>
    addBook: (path: string) => Promise<{ success: boolean, book?: Book, error?: string }>
    updateBookProgress: (data: { id: string, currentPage?: number, totalPage?: number, lastReadTime?: number }) => Promise<boolean>
    removeBook: (id: string) => Promise<boolean>
    checkFileExists: (path: string) => Promise<boolean>
    loadBook: (path: string) => Promise<{ success: boolean, images?: { name: string, data: string }[], error?: string }>

    // Dialogs
    openFileDialog: () => Promise<{ canceled: boolean, filePaths: string[] }>
    readImageFiles: (paths: string[]) => Promise<{ success: boolean, images?: { name: string, data: string }[], parentPath?: string, error?: string }>

    // OCR 核心
    recognizeText: (imageBase64: string) => Promise<{
        success: boolean
        text?: string
        error?: string
    }>
    tokenize: (text: string) => Promise<{
        success: boolean
        tokens?: Token[]
        error?: string
    }>

    // 窗口控制
    minimizeWindow: () => void
    maximizeWindow: () => void
    closeWindow: () => void
    onWindowStateChange: (callback: (state: 'maximized' | 'normal') => void) => void

    // Settings (Config)
    getSettings: () => Promise<AppSettings>
    saveSetting: (key: string, value: any) => void
    openConfigFile: () => void

    openLink: (url: string) => Promise<void>

    // 快捷键
    updateShortcuts: (shortcuts: Record<string, string>) => Promise<boolean>
    onShortcutTriggered: (callback: (action: string) => void) => () => void

    checkModel: () => Promise<{ success: boolean; exists?: boolean; error?: string }>
    downloadModel: () => Promise<{ success: boolean; error?: string }>
    deleteModel: () => Promise<{ success: boolean; error?: string }>
    translate: (text: string) => Promise<{ success: boolean; translation?: string; error?: string }>

    // 后端状态检查
    checkBackendReady: () => Promise<boolean>

    onDownloadProgress: (callback: (percent: number) => void) => () => void
    onInitStatus: (callback: (msg: string) => void) => () => void
    onInitProgress: (callback: (data: { percent: number, message: string }) => void) => () => void
    onInitError: (callback: (data: { message: string, detail: string }) => void) => () => void
}

declare global {
    interface Window {
        electronAPI: IElectronAPI
    }
}
