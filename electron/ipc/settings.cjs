// electron/ipc/settings.cjs
// 设置域:settings:* 通道 + 全局快捷键注册 依赖 store 快捷键触发时经 ctx 取当前窗口分发事件

const { ipcMain, globalShortcut } = require('electron')

/**
 * @param {typeof import('./context.cjs')} ctx
 */
module.exports = function registerSettingsIpc(ctx) {

    // 获取所有设置
    ipcMain.handle('settings:get', () => {
        return ctx.getStore().store
    })

    // 保存单个设置 (key, value)
    ipcMain.on('settings:set', (_event, key, value) => {
        ctx.getStore().set(key, value)
    })

    // 打开配置文件
    ipcMain.on('settings:open-config', () => {
        ctx.getStore().openInEditor()
    })

    // 批量更新快捷键设置
    ipcMain.handle('settings:update-shortcuts', (_event, /** @type {Record<String,String>} */ shortcuts) => {
        // 先清除所有旧的快捷键
        globalShortcut.unregisterAll()

        if (!shortcuts || typeof shortcuts !== 'object') {
            return false
        }

        // 遍历注册每个功能的快捷键
        for (const [action, shortcut] of Object.entries(shortcuts)) {
            if (!shortcut || typeof shortcut !== 'string' || shortcut.trim() === '') {
                continue
            }

            // 格式转换 "Ctrl + A" -> "Ctrl+A"
            const accelerator = shortcut.replace(/\s+/g, '')

            try {
                const ret = globalShortcut.register(accelerator, () => {
                    console.log(`[INFO] 快捷键触发: ${action} (${accelerator})`)

                    const win = ctx.getWindow()
                    if (!win) return
                    const isAppActive = win.isFocused()
                    if (isAppActive) {
                        win.webContents.send('shortcut:triggered', action)
                    }
                })

                if (!ret) {
                    console.warn(`[WARN] 快捷键注册失败 (可能被占用): ${action} - ${accelerator}`)
                }
            } catch (err) {
                console.error(`[ERROR] 快捷键注册异常: ${action}`, err)
            }
        }
        return true
    })
}
