// electron/ipc/register.cjs
// IPC 注册唯一入口:whenReady 内一次性注册全部通道
// 注册排在 initStore() 之后 createMainWindow() 之前:
// - renderer 只可能来自窗口加载的页面 因此不存在通道在依赖就绪前被调用的情况
// - 保持与重构前相同的失败语义(initStore 抛错则通道不注册)

const registerLibraryIpc = require('./library.cjs')
const registerBackendApi = require('./backend-api.cjs')
const registerSettingsIpc = require('./settings.cjs')
const registerSystemIpc = require('./system.cjs')
const registerFilesIpc = require('./files.cjs')
const registerMangaProtocol = require('./protocol.cjs')

/**
 * @param {typeof import('./context.cjs')} ctx
 */
function registerAll(ctx) {
    registerLibraryIpc(ctx)
    registerBackendApi(ctx)
    registerSettingsIpc(ctx)
    registerSystemIpc(ctx)
    registerFilesIpc()
    registerMangaProtocol()
}

module.exports = { registerAll }
