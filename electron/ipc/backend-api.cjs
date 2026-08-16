// electron/ipc/backend-api.cjs
// BackendService 依赖域:ocr:* / model:* / detection-module:* / dictionary:* / backend:* 五个前缀
// 全部是 BackendService 的薄代理 外加打开模型/检测模块文件夹
// 13 份同构样板由 withBackend 收编 少量保留原样显式写法(原因见 doc/electron-main-refactor.md §4.4)

const { ipcMain, shell } = require('electron')
const fs = require('fs')
const path = require('path')

/**
 * 包装 BackendService 薄代理:检查实例存在(可选检查 isReady)-> 执行 -> 异常转 { success:false }
 * @param {typeof import('./context.cjs')} ctx
 * @param {(backend: import('../backend-service.cjs').BackendService, ...args: any[]) => any} fn
 * @param {{ requireReady?: boolean, notReadyMessage?: string }} [options]
 */
function withBackend(ctx, fn, { requireReady = false, notReadyMessage = 'Service not ready' } = {}) {
    return async (_event, ...args) => {
        try {
            const backend = ctx.getBackend()
            if (!backend || (requireReady && !backend.isReady)) {
                return { success: false, error: notReadyMessage }
            }
            return await fn(backend, ...args)
        } catch (e) {
            return { success: false, error: e.message }
        }
    }
}

const OCR_NOT_READY = 'OCR service not ready. Please wait...'

/**
 * @param {typeof import('./context.cjs')} ctx
 */
module.exports = function registerBackendApi(ctx) {

    // OCR 识别请求
    // 保留显式写法 原代码在就绪检查之前打印请求日志 走 withBackend 会改变日志时机
    ipcMain.handle('ocr:recognize', async (_event, imageBase64) => {
        try {
            console.log('Received OCR request, image size:', imageBase64.length)

            const backend = ctx.getBackend()
            if (!backend || !backend.isReady) {
                return {
                    success: false,
                    error: OCR_NOT_READY
                }
            }

            const { text } = await backend.recognize(imageBase64)

            return {
                success: true,
                text: text
            }
        } catch (error) {
            console.error('OCR recognition error:', error)
            return {
                success: false,
                error: error.message
            }
        }
    })

    ipcMain.handle('ocr:detect-text-regions', withBackend(ctx, async (backend, imageBase64) => {
        const result = await backend.detectTextRegions(imageBase64)
        return { success: true, regions: result.regions || [] }
    }, { requireReady: true, notReadyMessage: OCR_NOT_READY }))

    // 取消时无服务也静默成功(不返回 not ready),保持原样
    ipcMain.handle('ocr:cancel-text-detection', () => {
        try {
            const backend = ctx.getBackend()
            if (backend) backend.cancelTextDetection()
            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    })

    // 分词请求
    ipcMain.handle('ocr:tokenize', withBackend(ctx, async (backend, text) => {
        const result = await backend.tokenize(text)
        console.log(`Tokenize result: ${result?.tokens?.length || 0} tokens found`)
        if (!result) {
            throw new Error('Service returned empty result')
        }

        // Service 返回的是 { tokens: [...] }
        return { success: true, tokens: result.tokens }
    }))

    // 翻译请求
    ipcMain.handle('ocr:translate', withBackend(ctx, async (backend, text, modelId) => {
        const result = await backend.translate(text, modelId)
        return { success: true, translation: result.translation, modelId: result.modelId }
    }))

    // 模型相关
    ipcMain.handle('model:list', withBackend(ctx, async (backend) => {
        const result = await backend.listTranslationModels()
        return { success: true, ...result }
    }))

    // 检查模型状态
    ipcMain.handle('model:check', withBackend(ctx, async (backend, modelId) => {
        const result = await backend.checkModel(modelId)
        return { success: true, exists: result.exists, modelId: result.modelId }
    }))

    // 下载模型
    ipcMain.handle('model:download', withBackend(ctx, async (backend, modelId) => {
        const result = await backend.downloadModel(modelId)
        return { success: true, modelId: result.modelId }
    }))

    // 删除模型
    ipcMain.handle('model:delete', withBackend(ctx, async (backend, modelId) => {
        const result = await backend.deleteModel(modelId)
        return { success: true, modelId: result.modelId }
    }))

    // detection-module:check / download 原样直通返回值(不再包一层 { success: true })
    ipcMain.handle('detection-module:check', withBackend(ctx, (backend) => {
        return backend.checkDetectionModule()
    }))

    ipcMain.handle('detection-module:download', withBackend(ctx, (backend) => {
        const store = ctx.getStore()
        return backend.downloadDetectionModule(store?.get('downloadSource', 'mirror'))
    }))

    ipcMain.handle('detection-module:delete', withBackend(ctx, async (backend) => {
        await backend.deleteDetectionModule()
        return { success: true }
    }))

    ipcMain.handle('dictionary:check', withBackend(ctx, async (backend) => {
        const result = await backend.checkDictionary()
        return { success: true, exists: result.exists }
    }))

    ipcMain.handle('dictionary:download', withBackend(ctx, async (backend) => {
        await backend.downloadDictionary()
        return { success: true }
    }))

    ipcMain.handle('dictionary:delete', withBackend(ctx, async (backend) => {
        await backend.deleteDictionary()
        return { success: true }
    }))

    ipcMain.handle('backend:check-ready', () => {
        const backend = ctx.getBackend()
        return backend ? backend.isReady : false
    })

    ipcMain.handle('backend:retry-init', (_event, source) => {
        try {
            const store = ctx.getStore()
            const backend = ctx.getBackend()
            const normalizedSource = source === 'official' ? 'official' : 'mirror'
            store.set('downloadSource', normalizedSource)
            if (!backend) return { success: false, error: 'Service not available' }
            backend.restart(normalizedSource)
            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    })

    //  打开模型文件夹
    ipcMain.on('open-model-folder', () => {
        const modelsRoot = ctx.getPaths().modelsPath
        if (!fs.existsSync(modelsRoot)) {
            fs.mkdirSync(modelsRoot, { recursive: true })
        }
        shell.openPath(modelsRoot)
    })

    ipcMain.on('open-detection-module-folder', () => {
        const detectionModuleRoot = path.join(ctx.getPaths().servicesModulesPath, 'text_detection', 'installed')
        fs.mkdirSync(detectionModuleRoot, { recursive: true })
        shell.openPath(detectionModuleRoot)
    })
}
