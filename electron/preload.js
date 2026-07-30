// electron/preload.js
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    // 打开模型文件夹
    openModelFolder: () => {
        ipcRenderer.send('open-model-folder')
    },

    // OCR 识别
    recognizeText: (imageBase64) => {
        return ipcRenderer.invoke('ocr:recognize', imageBase64)
    },
    detectTextRegions: (imageBase64) => ipcRenderer.invoke('ocr:detect-text-regions', imageBase64),
    cancelTextDetection: () => ipcRenderer.invoke('ocr:cancel-text-detection'),

    // 分词识别
    tokenize: (text) => ipcRenderer.invoke('ocr:tokenize', text),

    // 翻译
    translate: (text, modelId) => ipcRenderer.invoke('ocr:translate', text, modelId),

    // Library System
    getLibrary: () => ipcRenderer.invoke('library:get-all'),
    addBook: (path, kind) => ipcRenderer.invoke('library:add', path, kind),
    updateBookProgress: (data) => ipcRenderer.invoke('library:update-progress', data),
    updateAutoTranslatePage: (data) => ipcRenderer.invoke('library:update-auto-translate-page', data),
    removeBook: (id) => ipcRenderer.invoke('library:remove', id),
    checkFileExists: (path) => ipcRenderer.invoke('fs:exists', path),

    // Dialogs
    openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
    readImageFiles: (paths) => ipcRenderer.invoke('files:read-images', paths),
    selectExportDirectory: (defaultName) => ipcRenderer.invoke('dialog:select-export-directory', defaultName),
    saveExportedImage: (data) => ipcRenderer.invoke('files:save-exported-image', data),

    // 窗口控制 声明给渲染进程
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    maximizeWindow: () => ipcRenderer.send('window:maximize'),
    closeWindow: () => ipcRenderer.send('window:close'),

    //  监听窗口状态变化
    onWindowStateChange: (callback) => {
        ipcRenderer.on('window:state-change', (event, state) => callback(state))
    },

    //  Settings API
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSetting: (key, value) => ipcRenderer.send('settings:set', key, value),
    openConfigFile: () => ipcRenderer.send('settings:open-config'),
    openLink: (url) => ipcRenderer.invoke('shell:open', url),

    // 批量设置快捷键
    updateShortcuts: (shortcuts) => ipcRenderer.invoke('settings:update-shortcuts', shortcuts),

    // 监听快捷键触发 (callback 接收 action 字符串)
    onShortcutTriggered: (callback) => {
        const handler = (_event, action) => callback(action)
        ipcRenderer.on('shortcut:triggered', handler)
        return () => ipcRenderer.removeListener('shortcut:triggered', handler)
    },

    // 模型API管理
    listTranslationModels: () => ipcRenderer.invoke('model:list'),
    checkModel: (modelId) => ipcRenderer.invoke('model:check', modelId),
    downloadModel: (modelId) => ipcRenderer.invoke('model:download', modelId),
    deleteModel: (modelId) => ipcRenderer.invoke('model:delete', modelId),
    checkDictionary: () => ipcRenderer.invoke('dictionary:check'),
    downloadDictionary: () => ipcRenderer.invoke('dictionary:download'),
    deleteDictionary: () => ipcRenderer.invoke('dictionary:delete'),
    checkDetectionModule: () => ipcRenderer.invoke('detection-module:check'),
    downloadDetectionModule: () => ipcRenderer.invoke('detection-module:download'),
    deleteDetectionModule: () => ipcRenderer.invoke('detection-module:delete'),
    openDetectionModuleFolder: () => ipcRenderer.send('open-detection-module-folder'),
    // 后端初始化完毕之后主动发送消息
    backendStatus: (callback) => {
        const handler = (_event, data) => callback(data)
        ipcRenderer.on('backend-status', handler)
        return () => ipcRenderer.removeListener('backend-status', handler)
    },
    // 主动检查后端状态
    checkBackendReady: () => ipcRenderer.invoke('backend:check-ready'),
    retryBackendInit: (source) => ipcRenderer.invoke('backend:retry-init', source),
    // 下载进度
    onDownloadProgress: (callback) => {
        const handler = (_event, data) => callback(data)
        ipcRenderer.on('model:download-progress', handler)
        // 返回清理函数
        return () => ipcRenderer.removeListener('model:download-progress', handler)
    },
    onDictionaryDownloadProgress: (callback) => {
        const handler = (_event, percent) => callback(percent)
        ipcRenderer.on('dictionary:download-progress', handler)
        return () => ipcRenderer.removeListener('dictionary:download-progress', handler)
    },
    onDetectionModuleDownloadProgress: (callback) => {
        const handler = (_event, data) => callback(data)
        ipcRenderer.on('detection-module:download-progress', handler)
        return () => ipcRenderer.removeListener('detection-module:download-progress', handler)
    },
    onInitStatus: (callback) => {
        const handler = (_event, message) => callback(message)
        ipcRenderer.on('init-status', handler)
        return () => ipcRenderer.removeListener('init-status', handler)
    },
    //  监听初始化进度
    onInitProgress: (callback) => {
        const handler = (_event, data) => callback(data)
        ipcRenderer.on('init-progress', handler)
        return () => ipcRenderer.removeListener('init-progress', handler)
    },
    //  监听初始化错误
    onInitError: (callback) => {
        const handler = (_event, data) => callback(data)
        ipcRenderer.on('init-error', handler)
        return () => ipcRenderer.removeListener('init-error', handler)
    },
    // 监听后端日志
    onBackendLog: (callback) => {
        const handler = (_event, msg) => callback(msg)
        ipcRenderer.on('backend:log', handler)
        return () => ipcRenderer.removeListener('backend:log', handler)
    },

    // 获取图片路径
    getPathForFile: (file) => webUtils.getPathForFile(file)
})
