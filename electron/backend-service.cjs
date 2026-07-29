// electron/backend-service.cjs
const { spawn } = require('child_process')
const path = require('path')
const { EventEmitter } = require('events')

/**
 * @typedef {Object} PythonResponse
 * @property {string} [type] - 进度或状态事件的类型
 * @property {string} [status] - 状态标记 (如 'ready')
 * @property {number} [id] - 请求对应的 ID
 * @property {boolean} [success] - 核心任务是否成功
 * @property {string} [text] - OCR 识别出的文本
 * @property {Array} [tokens] - 分词结果
 * @property {string} [translation] - 翻译结果
 * @property {boolean} [exists] - 模型是否存在
 * @property {string} [error] - 报错信息
 */

/**
 * @typedef {Object} RequestPayload
 * @property {string} command - 指令名称 (如 'recognize', 'tokenize')
 * @property {string} [image] - 图片 Base64
 * @property {string} [text] - 待处理的文本
 * @property {string} [path] - 文件路径
 */

class BackendService extends EventEmitter {
    constructor(modelPath, modulesPath) {
        super()
        this.modelPath = modelPath
        this.modulesPath = modulesPath
        this.process = null
        this.isReady = false
        /** @type {Map<number, {resolve: Function, reject: Function}>} */
        this.pendingRequests = new Map()
        this.requestId = 0
        this.responseBuffer = ''
        this.lastProcessError = ''
    }

    start() {
        const isDev = !require('electron').app.isPackaged
        let pythonPath, scriptPath

        if (isDev) {
            // 确保能找到 python.exe
            pythonPath = path.join(__dirname, '../services/venv/Scripts/python.exe')
            scriptPath = path.join(__dirname, '../services/backend_service.py')
        } else {
            // 生产环境直接调用打包好的 exe
            // electron-forge extraResource 会将文件放在 resources 根目录下
            pythonPath = path.join(process.resourcesPath, 'backend', 'backend.exe')
            scriptPath = null
        }

        const args = []
        if (scriptPath) {
            args.push('-u', scriptPath) // 控制py解释器不使用缓存
        }

        // 传入模型路径参数
        if (this.modelPath) {
            args.push('--model-dir', this.modelPath)
        }
        if (this.modulesPath) {
            args.push('--modules-root', this.modulesPath)
        }

        console.log('[INFO] Starting OCR service...')
        console.log('[INFO] Model Path:', this.modelPath)

        const backendEnv = {
            ...process.env,
            PYTHONUNBUFFERED: '1', // 关闭py的流缓冲
            PYTHONIOENCODING: 'utf-8',
            // 设置 HF 镜像
            HF_ENDPOINT: 'https://hf-mirror.com'
        }
        if (!isDev) {
            backendEnv.MANGAREADER_TRANSLATE_WORKER = '1'
        }

        this.process = spawn(pythonPath, args, {
            // spawn 调用之后 py子进程就开始运行了
            stdio: ['pipe', 'pipe', 'pipe'],
            env: backendEnv
        })

        this.process.stdin.setDefaultEncoding('utf-8')
        this.process.stdout.setEncoding('utf-8')
        this.process.stderr.setEncoding('utf-8')

        this.process.stdin.on('error', (err) => {
            this.lastProcessError = err.message
            console.error('[Backend Service] [ERROR] stdin error:', err)
            this.emit('log', `[stdin error] ${err.message}`)
            this.isReady = false
            this.pendingRequests.forEach(r => r.reject(new Error(`Backend stdin error: ${err.message}`)))
            this.pendingRequests.clear()
        })

        // 监听日志 (stderr)
        this.process.stderr.on('data',/** @param {Buffer} data */(data) => {
            const msg = data.toString().trim() // toString() 将buffer编码之后转换
            // 这里考虑到简洁性不做粘包半包处理 同时trim()处理掉py的print打印之后自带的/n避免与console的重复
            console.log('[OCR Core]', msg)
            // 发送日志事件，以便 main.js 可以转发给前端
            this.emit('log', msg)
        })

        // 监听py返回的数据 (stdout)
        this.process.stdout.on('data', (chunk) => {
            // 处理半包粘包问题
            this.responseBuffer += chunk
            const lines = this.responseBuffer.split('\n')
            this.responseBuffer = lines.pop() || ''

            // 对剩下的完整数据包进行操作
            lines.forEach(line => {
                line = line.trim()
                if (!line) return
                try {
                    const response = JSON.parse(line)
                    this._handleResponse(response)
                } catch (e) {
                    console.error('[JSON Parse Error]', e, 'Line:', line)
                    this.emit('log', `[JSON Parse Error] ${e.message} Line: ${line}`)
                }
            })
        })

        // 监听由nodejs底层引擎emit的事件
        this.process.on('error', (err) => {
            console.error('OCR Process Error:', err)
            this.lastProcessError = err.message
            this.emit('log', `[Process Error] ${err.message}`)
        })

        this.process.on('exit', (code) => {
            console.log(`OCR Process exited: ${code}`)
            this.emit('log', `[Process Exit] Code: ${code}`)
            this.isReady = false
            this.process = null
            // ocr退出之后 终止所有的请求后清空请求列表
            this.pendingRequests.forEach(r => r.reject(new Error('OCR Service Exited')))
            this.pendingRequests.clear()
        })
    }

    /**
     * @param {PythonResponse} response 
     */
    _handleResponse(response) {

        //  处理初始化阶段的下载进度
        if (response.type === 'init_progress') {
            this.emit('init-progress', response)
            return
        }

        if (response.type === 'init_status') {
            this.emit('init-status', response.message)
            return
        }

        if (response.type === 'init_error') {
            this.emit('init-error', response)
            return
        }

        if (response.status === 'ready') {
            this.isReady = true
            console.log('OCR Service is Ready!')
            this.emit('ready')
            return
        }

        // 触发 download-progress 事件 不断汇报下载进度
        if (response.type === 'download_progress') {
            this.emit('download-progress', response)
            return
        }

        if (response.type === 'dictionary_download_progress') {
            this.emit('dictionary-download-progress', response.percent)
            return
        }

        if (response.type === 'detection_module_download_progress') {
            this.emit('detection-module-download-progress', response)
            return
        }

        const { id, success, error } = response

        if (id !== undefined && this.pendingRequests.has(id)) {
            console.log(`[Backend Service] [DEBUG] Resolving request ID: ${id}, Success: ${success}`)
            /**
             * @type {{resolve: Function, reject: Function}}
             */
            const { resolve, reject } = this.pendingRequests.get(id)
            this.pendingRequests.delete(id)

            if (success) {
                const result = { ...response }
                delete result.id
                if (response.model_id !== undefined) result.modelId = response.model_id
                if (response.default_model_id !== undefined) result.defaultModelId = response.default_model_id
                if (response.current_model_id !== undefined) result.currentModelId = response.current_model_id
                resolve(result)
            } else {
                reject(new Error(error))
            }
        } else if (id !== undefined) {
            console.warn(`[Backend Service] [WARN] Received response for unknown ID: ${id}`)
        }
    }

    /**
     * @param {RequestPayload} payload 
     * @param {number} timeout 
     */
    _sendRequest(payload, timeout = 120000) {
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                console.warn('[Backend Service] [WARN] Service not ready, rejecting request.')
                reject(new Error(this.lastProcessError || 'OCR Service is initializing... please wait.'))
                return
            }

            if (!this.process || !this.process.stdin || this.process.stdin.destroyed || this.process.killed) {
                console.warn('[Backend Service] [WARN] Service process is not writable.')
                reject(new Error(this.lastProcessError || 'OCR Service process is not running.'))
                return
            }

            const id = this.requestId++
            this.pendingRequests.set(id, { resolve, reject })

            // 合并 ID 和 具体的请求数据id在后为避免被恶意覆盖
            const request = { ...payload, id }

            console.log(`[Backend Service] [DEBUG] Sending request ID: ${id}, Command: ${payload.command}`)

            try {
                // 用 Base64 传输，避免 Windows 管道编码问题
                const jsonStr = JSON.stringify(request)
                const base64Str = Buffer.from(jsonStr, 'utf-8').toString('base64') // 这里是对request序列化之后得到的json字符串先utf8编码为二进制的字节 之后再base64编码 py端收到之后再进行反向操作

                console.log(`[Backend Service] [DEBUG] Writing Base64 payload to stdin (Length: ${base64Str.length})`)
                this.process.stdin.write(base64Str + '\n', (err) => {
                    if (!err) return
                    console.error('[Backend Service] [ERROR] Failed to write to stdin:', err)
                    this.lastProcessError = err.message
                    this.isReady = false
                    if (this.pendingRequests.has(id)) {
                        this.pendingRequests.delete(id)
                        reject(err)
                    }
                }) // 发送给子进程py处理
            } catch (e) {
                console.error('[Backend Service] [ERROR] Failed to write to stdin:', e)
                this.lastProcessError = e.message
                this.isReady = false
                this.pendingRequests.delete(id)
                reject(e)
                return
            }

            // 超时处理
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    console.warn(`[Backend Service] [WARN] Request ID: ${id} timed out.`)
                    this.pendingRequests.delete(id)
                    reject(new Error(`Request timeout (${timeout}ms)`))
                }
            }, timeout)
        })
    }

    /**
    * OCR 识别
    * @param {string} imageBase64 
    * @returns {Promise<{ text: string }>}
    */
    async recognize(imageBase64) {
        return this._sendRequest({ command: 'recognize', image: imageBase64 })
    }

    /**
     * 分词
     * @param {string} text 
     * @returns {Promise<{ tokens: any[] }>}
     */
    async tokenize(text) {
        // _handleResponse 会返回 { tokens: [...] }
        return this._sendRequest({ command: 'tokenize', text: text }, 30000)
    }

    /**
     * 翻译
     * @param {string} text 
     * @returns {Promise<{ translation: string }>}
     */
    async translate(text, modelId) {
        console.log(`[Backend Service] [DEBUG] translate() called with text length: ${text.length}`)
        // 超时时间较长，第一次要下载模型 (比如 10分钟 = 600000ms)
        return this._sendRequest({ command: 'translate', text: text, model_id: modelId }, 600000)
    }

    async listTranslationModels() {
        return this._sendRequest({ command: 'list_translation_models' }, 10000)
    }

    async checkModel(modelId) {
        return this._sendRequest({ command: 'check_model', model_id: modelId }, 10000)
    }

    async downloadModel(modelId) {
        // 下载 1.2GB 可能很慢，给 30 分钟超时
        return this._sendRequest({ command: 'download_model', model_id: modelId }, 21600000)
    }

    async deleteModel(modelId) {
        return this._sendRequest({ command: 'delete_model', model_id: modelId }, 20000)
    }

    async checkDictionary() {
        return this._sendRequest({ command: 'check_dictionary' }, 10000)
    }

    async downloadDictionary() {
        return this._sendRequest({ command: 'download_dictionary' }, 900000)
    }

    async deleteDictionary() {
        return this._sendRequest({ command: 'delete_dictionary' }, 20000)
    }

    async checkDetectionModule() {
        return this._sendRequest({ command: 'check_detection_module' }, 10000)
    }

    async downloadDetectionModule() {
        return this._sendRequest({ command: 'download_detection_module' }, 21600000)
    }

    async deleteDetectionModule() {
        return this._sendRequest({ command: 'delete_detection_module' }, 20000)
    }

    async detectTextRegions(imageBase64) {
        return this._sendRequest({ command: 'detect_text_regions', image: imageBase64 }, 120000)
    }

    async extractCover(path) {
        return this._sendRequest({ command: 'extract_cover', path: path }, 30000)
    }

    stop() {
        if (this.process) this.process.kill()
    }
}

module.exports = { BackendService }
