// electron/ipc/context.cjs
// 主进程长期存活实例的唯一持有者 main.cjs 负责写入(set*),ipc 域模块经参数注入读取(get*)
// getter 每次调用返回当前绑定(闭包捕获变量而非值):窗口重建 后端重启后,
// 调用方自然拿到最新实例   这是传参结构下保住原闭包行为的关键

/** @typedef {import('../backend-service.cjs').BackendService} BackendService */
/** @typedef {import('electron-store').default} ElectronStore */
/** @typedef {import('electron').BrowserWindow} BrowserWindow */

/** @type {BrowserWindow | null} */
let mainWindow = null

/** @type {BackendService | null} */
let backendService = null

/** @type {ElectronStore | null} */
let store = null

/** @type {{ modelsPath: string, servicesModulesPath: string } | null} */
let paths = null

module.exports = {
    /** @param {BrowserWindow | null} win */
    setMainWindow(win) { mainWindow = win },

    /** @param {BackendService | null} backend */
    setBackend(backend) { backendService = backend },

    /** @param {ElectronStore | null} s */
    setStore(s) { store = s },

    /** @param {{ modelsPath: string, servicesModulesPath: string }} p */
    setPaths(p) { paths = p },

    /** @returns {BrowserWindow | null} */
    getWindow: () => mainWindow,

    /** @returns {BackendService | null} */
    getBackend: () => backendService,

    /** @returns {ElectronStore | null} */
    getStore: () => store,

    /** @returns {{ modelsPath: string, servicesModulesPath: string } | null} */
    getPaths: () => paths
}
