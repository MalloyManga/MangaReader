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

    // 分词识别
    tokenize: (text) => ipcRenderer.invoke('ocr:tokenize', text),

    // 翻译
    translate: (text) => ipcRenderer.invoke('ocr:translate', text),

    // Library System
    getLibrary: () => ipcRenderer.invoke('library:get-all'),
    addBook: (path) => ipcRenderer.invoke('library:add', path),
    updateBookProgress: (data) => ipcRenderer.invoke('library:update-progress', data),
    removeBook: (id) => ipcRenderer.invoke('library:remove', id),
    checkFileExists: (path) => ipcRenderer.invoke('fs:exists', path),

    // Dialogs
    openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
    readImageFiles: (paths) => ipcRenderer.invoke('files:read-images', paths),

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
    checkModel: () => ipcRenderer.invoke('model:check'),
    downloadModel: () => ipcRenderer.invoke('model:download'),
    deleteModel: () => ipcRenderer.invoke('model:delete'),
    // 后端初始化完毕之后主动发送消息
    backendStatus: (callback) => {
        const handler = (_event, data) => callback(data)
        ipcRenderer.on('backend-status', handler)
        return () => ipcRenderer.removeListener('backend-status', handler)
    },
    // 主动检查后端状态
    checkBackendReady: () => ipcRenderer.invoke('backend:check-ready'),
    // 下载进度
    onDownloadProgress: (callback) => {
        const handler = (_event, percent) => callback(percent)
        ipcRenderer.on('model:download-progress', handler)
        // 返回清理函数
        return () => ipcRenderer.removeListener('model:download-progress', handler)
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
