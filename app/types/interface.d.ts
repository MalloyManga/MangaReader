// types/electron.d.ts
export interface Token {
    word: string
    type: 'noun' | 'verb' | 'particle' | 'adjective' | 'other'
    reading?: string
    dictionary_form?: string
}

export type ReadingMode = 'study' | 'list' | 'immersive'
export type DownloadSource = 'mirror' | 'official'

// 定义设置对象的接口
export interface AppSettings {
    readingMode: ReadingMode
    enableTranslation: boolean
    translationModelId: string
    enableTokenization: boolean
    translationApiKey: string // 翻译APIkey
    // 目前还没有开发该部分功能 后续需要添加防抖
    theme: 'system' | 'light' | 'dark'
    ocrShortcut: string
    prevImageShortcut?: string
    nextImageShortcut?: string
    downloadSource: DownloadSource
}

// OCR 结果块
export interface OcrBlock {
    id: string
    source?: 'manual' | 'auto'
    rect: {        // 相对原图坐标
        x: number
        y: number
        width: number
        height: number
    }
    original: string
    translation: string
    tokens: Token[]
    status: 'loading' | 'done' | 'error'
    showOriginal: boolean // 当前显示原文还是译文
}

export interface DetectedTextRegion {
    x: number
    y: number
    width: number
    height: number
    confidence?: number
    direction?: 'horizontal' | 'vertical' | 'unknown'
}

export interface ImageItem {
    id: string
    url: string
    file?: File
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

export interface TranslationModel {
    id: string
    name: string
    size: string
    size_bytes?: number
    description: string
    engine: string
    adapted_types?: string[]
}

export interface DownloadProgress {
    percent: number
    filename?: string
    model_id?: string
    modelId?: string
    stage?: string
}

export interface IElectronAPI {
    backendStatus: (callback) => () => void

    getLibrary: () => Promise<Book[]>
    addBook: (path: string) => Promise<{ success: boolean, book?: Book, alreadyExists?: boolean, error?: string }>
    updateBookProgress: (data: { id: string, currentPage?: number, totalPage?: number, lastReadTime?: number }) => Promise<boolean>
    removeBook: (id: string) => Promise<boolean>
    checkFileExists: (path: string) => Promise<boolean>

    openFileDialog: () => Promise<{
        canceled: boolean,
        filePaths: string[]
    }>
    readImageFiles: (paths: string[]) => Promise<{
        success: boolean,
        imagePaths?: string[],
        error?: string
    }>

    // OCR 核心
    recognizeText: (imageBase64: string) => Promise<{
        success: boolean
        text?: string
        error?: string
    }>
    detectTextRegions: (imageBase64: string) => Promise<{
        success: boolean
        regions?: DetectedTextRegion[]
        error?: string
    }>
    checkDetectionModule: () => Promise<{
        success: boolean
        installed?: boolean
        available?: boolean
        corrupted?: boolean
        version?: string
        module_path?: string
        message?: string
        error?: string
    }>
    downloadDetectionModule: () => Promise<{ success: boolean, version?: string, error?: string }>
    deleteDetectionModule: () => Promise<{ success: boolean, error?: string }>
    openDetectionModuleFolder: () => void
    onDetectionModuleDownloadProgress: (callback: (progress: number | { percent?: number, stage?: string, message?: string }) => void) => () => void
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

    // 设置相关
    getSettings: () => Promise<AppSettings>
    saveSetting: (key: string, value: any) => void
    openConfigFile: () => void


    // 快捷键
    updateShortcuts: (shortcuts: Record<string, string>) => Promise<boolean>
    onShortcutTriggered: (callback: (action: string) => void) => () => void

    listTranslationModels: () => Promise<{
        success: boolean
        models?: TranslationModel[]
        defaultModelId?: string
        currentModelId?: string
        error?: string
    }>
    checkModel: (modelId?: string) => Promise<{ success: boolean; exists?: boolean; modelId?: string; error?: string }>
    downloadModel: (modelId?: string) => Promise<{ success: boolean; modelId?: string; error?: string }>
    deleteModel: (modelId?: string) => Promise<{ success: boolean; modelId?: string; error?: string }>
    checkDictionary: () => Promise<{ success: boolean; exists?: boolean; error?: string }>
    downloadDictionary: () => Promise<{ success: boolean; error?: string }>
    deleteDictionary: () => Promise<{ success: boolean; error?: string }>
    translate: (text: string, modelId?: string) => Promise<{ success: boolean; translation?: string; modelId?: string; error?: string }>

    // 后端状态检查
    checkBackendReady: () => Promise<boolean>
    retryBackendInit: (source: DownloadSource) => Promise<{ success: boolean, error?: string }>
    onBackendLog: (callback: (msg) => void) => () => void
    onDownloadProgress: (callback: (progress: number | DownloadProgress) => void) => () => void
    onDictionaryDownloadProgress: (callback: (percent: number) => void) => () => void
    onInitStatus: (callback: (msg: string) => void) => () => void
    onInitProgress: (callback: (data: { percent: number, message: string }) => void) => () => void
    onInitError: (callback: (data: { message: string, detail: string, can_retry_download?: boolean }) => void) => () => void

    getPathForFile: (file: File) => string
    openModelFolder: (channel) => void
    openLink: (url: string) => Promise<void>
}

declare global {
    interface Window {
        electronAPI: IElectronAPI
    }
}
