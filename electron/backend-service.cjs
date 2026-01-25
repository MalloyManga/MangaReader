// electron/backend-service.cjs
const { spawn } = require('child_process')
const path = require('path')
const { EventEmitter } = require('events')

class BackendService extends EventEmitter {
    constructor(modelPath) {
        super()
        this.modelPath = modelPath
        this.process = null
        this.isReady = false
        this.pendingRequests = new Map()
        this.requestId = 0
        this.responseBuffer = ''
    }

    start() {
        const isDev = !require('electron').app.isPackaged
        let pythonPath, scriptPath

        if (isDev) {
            // 注意：这里路径根据你的项目结构微调，确保能找到 python.exe
            pythonPath = path.join(__dirname, '../services/venv/Scripts/python.exe')
            scriptPath = path.join(__dirname, '../services/backend_service.py')
        } else {
            // 生产环境：直接调用打包好的 exe
            // 注意：electron-forge extraResource 会将文件放在 resources 根目录下
            pythonPath = path.join(process.resourcesPath, 'backend', 'backend.exe')
            scriptPath = null
        }

        const args = []
        if (scriptPath) {
            args.push('-u', scriptPath)
        }

        // 传入模型路径参数
        if (this.modelPath) {
            args.push('--model-dir', this.modelPath)
        }

        console.log('[INFO] Starting OCR service...')
        console.log('[INFO] Model Path:', this.modelPath)

        this.process = spawn(pythonPath, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                PYTHONIOENCODING: 'utf-8',
                // 可以在这里设置 HF 镜像，如果用户在国内
                HF_ENDPOINT: 'https://hf-mirror.com'
            }
        })

        this.process.stdin.setDefaultEncoding('utf-8')
        this.process.stdout.setEncoding('utf-8')
        this.process.stderr.setEncoding('utf-8')

        // 监听日志 (stderr)
        this.process.stderr.on('data', (data) => {
            const msg = data.toString().trim()
            console.log('[OCR Core]', msg)
            // 发送日志事件，以便 main.js 可以转发给前端
            this.emit('log', msg)
        })

        // 监听数据 (stdout)
        this.process.stdout.on('data', (data) => {
            this.responseBuffer += data
            const lines = this.responseBuffer.split('\n')
            this.responseBuffer = lines.pop() || ''

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

        this.process.on('error', (err) => {
            console.error('OCR Process Error:', err)
            this.emit('log', `[Process Error] ${err.message}`)
        })

        this.process.on('exit', (code) => {
            console.log(`OCR Process exited: ${code}`)
            this.emit('log', `[Process Exit] Code: ${code}`)
            this.isReady = false
            this.pendingRequests.forEach(r => r.reject(new Error('OCR Service Exited')))
            this.pendingRequests.clear()
        })
    }

    _handleResponse(response) {
        // console.log('[Backend Service] [DEBUG] Raw response object:', JSON.stringify(response).substring(0, 100) + '...')

        if (response.status === 'ready') {
            this.isReady = true
            console.log('OCR Service is Ready!')
            this.emit('ready')
            return
        }

        if (response.type === 'download_progress') {
            // 向外发射 'download-progress' 事件
            this.emit('download-progress', response.percent)
            return
        }

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

        const { id, success, text, tokens, translation, exists, error } = response

        if (id !== undefined && this.pendingRequests.has(id)) {
            console.log(`[Backend Service] [DEBUG] Resolving request ID: ${id}, Success: ${success}`)
            const { resolve, reject } = this.pendingRequests.get(id)
            this.pendingRequests.delete(id)

            if (success) {
                if (tokens) {
                    resolve({ tokens: tokens })
                } else if (translation) {
                    resolve({ translation: translation })
                } else if (response.cover) {
                    resolve({ cover: response.cover })
                } else if (exists !== undefined) {
                    resolve({ exists })
                } else {
                    resolve(text || true)
                }
            } else {
                reject(new Error(error))
            }
        } else if (id !== undefined) {
            console.warn(`[Backend Service] [WARN] Received response for unknown ID: ${id}`)
        }
    }

    _sendRequest(payload, timeout = 120000) {
        return new Promise((resolve, reject) => {
            if (!this.isReady) {
                console.warn('[Backend Service] [WARN] Service not ready, rejecting request.')
                reject(new Error('OCR Service is initializing... please wait.'))
                return
            }

            const id = this.requestId++
            this.pendingRequests.set(id, { resolve, reject })

            // 合并 ID 和 具体的请求数据
            const request = { ...payload, id }

            console.log(`[Backend Service] [DEBUG] Sending request ID: ${id}, Command: ${payload.command}`)

            try {
                // [Fix Encoding] 使用 Base64 传输，彻底避免 Windows 管道编码问题
                const jsonStr = JSON.stringify(request)
                const base64Str = Buffer.from(jsonStr, 'utf-8').toString('base64')

                console.log(`[Backend Service] [DEBUG] Writing Base64 payload to stdin (Length: ${base64Str.length})`)
                this.process.stdin.write(base64Str + '\n')
            } catch (e) {
                console.error('[Backend Service] [ERROR] Failed to write to stdin:', e)
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

    // 1. OCR 识别
    async recognize(imageBase64) {
        // 调用通用方法
        return this._sendRequest({ command: 'recognize', image: imageBase64 })
    }

    // 2. 分词
    async tokenize(text) {
        // 调用通用方法，分词比较快，超时设短一点也没关系 (比如 10秒)
        // 注意：这里传的是 text，不是 image
        // _handleResponse 会返回 { tokens: [...] }
        return this._sendRequest({ command: 'tokenize', text: text }, 30000)
    }

    // 3. 翻译
    async translate(text) {
        console.log(`[Backend Service] [DEBUG] translate() called with text length: ${text.length}`)
        // 超时设长一点，因为第一次要下载模型 (比如 10分钟 = 600000ms)
        return this._sendRequest({ command: 'translate', text: text }, 600000)
    }

    async checkModel() {
        return this._sendRequest({ command: 'check_model' }, 10000)
    }

    async downloadModel() {
        // 下载 1.2GB 可能很慢，给 30 分钟超时
        return this._sendRequest({ command: 'download_model' }, 1800000)
    }

    async deleteModel() {
        return this._sendRequest({ command: 'delete_model' }, 20000)
    }

    async extractCover(path) {
        // Extracting cover might take a moment purely due to file IO
        return this._sendRequest({ command: 'extract_cover', path: path }, 30000)
    }

    stop() {
        if (this.process) this.process.kill()
    }
}

module.exports = { BackendService }
