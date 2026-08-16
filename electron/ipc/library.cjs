// electron/ipc/library.cjs
// 书架域:library:* 通道 依赖 store backend 仅用于封面提取

const { ipcMain } = require('electron')
const { randomUUID } = require('crypto')

/**
 * @typedef {Object} Book
 * @property {string} id - 唯一的 UUID
 * @property {string} path - 文件夹/文件路径
 * @property {string|null} cover - 图片 Base64 如果是 null 则没有封面
 * @property {number} totalPage - 总页数
 * @property {number} currentPage - 当前阅读页
 * @property {number} lastReadTime - 最后阅读时间的时间戳
 */

/**
 * @param {typeof import('./context.cjs')} ctx
 */
module.exports = function registerLibraryIpc(ctx) {

    ipcMain.handle('library:get-all', () => {
        const store = ctx.getStore()
        return store ? store.get('library', []) : []
    })

    ipcMain.handle('library:add', async (_event, pathStr, kind = 'standard') => {
        try {
            const store = ctx.getStore()
            const backend = ctx.getBackend()
            const normalizedKind = kind === 'auto-translate' ? 'auto-translate' : 'standard'
            /**
            * @type {Book[]}
            */
            const library = store.get('library', [])
            const existingBook = library.find(b => b.path === pathStr)
            if (existingBook) {
                if (normalizedKind === 'auto-translate' && existingBook.kind !== 'auto-translate') {
                    existingBook.kind = 'auto-translate'
                    existingBook.autoTranslatePages = existingBook.autoTranslatePages || {}
                    existingBook.autoTranslateDeletedRegions = existingBook.autoTranslateDeletedRegions || {}
                    existingBook.autoTranslateProcessedPages = existingBook.autoTranslateProcessedPages || []
                    existingBook.autoTranslatePageRevisions = existingBook.autoTranslatePageRevisions || {}
                    store.set('library', library)
                }
                return { success: true, book: existingBook, alreadyExists: true }
            }

            let cover = null
            // 后端获取到cover来当作封面
            if (backend && backend.isReady) {
                try {
                    const res = await backend.extractCover(pathStr)
                    if (res && res.cover) {
                        cover = `data:image/jpeg;base64,${res.cover}`
                    }
                } catch (e) {
                    console.error('Cover extraction failed:', e)
                }
            }

            const newBook = {
                id: randomUUID(),
                path: pathStr,
                cover: cover,
                totalPage: 0,
                currentPage: 0,
                lastReadTime: Date.now(),
                kind: normalizedKind,
                ...(normalizedKind === 'auto-translate' ? {
                    autoTranslatePages: {},
                    autoTranslateDeletedRegions: {},
                    autoTranslateProcessedPages: [],
                    autoTranslatePageRevisions: {}
                } : {})
            }

            library.push(newBook)
            store.set('library', library)
            return { success: true, book: newBook }
        } catch (e) {
            return { success: false, error: e.message }
        }
    })

    ipcMain.handle('library:update-progress', (_event, { id, currentPage, totalPage, lastReadTime }) => {
        const store = ctx.getStore()
        /**
        * @type {Book[]}
        */
        const library = store.get('library', [])
        const index = library.findIndex(b => b.id === id)
        if (index !== -1) {
            // 更新阅读进度
            if (currentPage !== undefined) library[index].currentPage = currentPage
            if (totalPage !== undefined) library[index].totalPage = totalPage
            if (lastReadTime !== undefined) library[index].lastReadTime = lastReadTime
            store.set('library', library)
            return true
        }
        return false
    })

    ipcMain.handle('library:update-auto-translate-page', (_event, {
        id,
        pageIndex,
        blocks,
        deletedRegions,
        processed,
        revision
    }) => {
        const store = ctx.getStore()
        const library = store.get('library', [])
        const index = library.findIndex(b => b.id === id)
        if (index === -1 || !Number.isInteger(pageIndex) || pageIndex < 0 || !Array.isArray(blocks)) return false
        const book = library[index]
        const pageKey = String(pageIndex)
        book.kind = 'auto-translate'
        book.autoTranslatePages = book.autoTranslatePages || {}
        book.autoTranslateDeletedRegions = book.autoTranslateDeletedRegions || {}
        book.autoTranslateProcessedPages = Array.isArray(book.autoTranslateProcessedPages)
            ? book.autoTranslateProcessedPages
            : []
        book.autoTranslatePageRevisions = book.autoTranslatePageRevisions || {}

        if (Number.isFinite(revision)) {
            const previousRevision = book.autoTranslatePageRevisions[pageKey] || 0
            if (revision < previousRevision) return false
            book.autoTranslatePageRevisions[pageKey] = revision
        }

        if (blocks.length) book.autoTranslatePages[pageKey] = blocks
        else delete book.autoTranslatePages[pageKey]
        if (Array.isArray(deletedRegions) && deletedRegions.length) {
            book.autoTranslateDeletedRegions[pageKey] = deletedRegions
        } else if (Array.isArray(deletedRegions)) {
            delete book.autoTranslateDeletedRegions[pageKey]
        }
        if (typeof processed === 'boolean') {
            const processedPages = new Set(book.autoTranslateProcessedPages)
            if (processed) processedPages.add(pageIndex)
            else processedPages.delete(pageIndex)
            book.autoTranslateProcessedPages = [...processedPages].sort((a, b) => a - b)
        }
        store.set('library', library)
        return true
    })

    ipcMain.handle('library:remove', (_event, id) => {
        const store = ctx.getStore()
        /**
        * @type {Book[]}
        */
        let library = store.get('library', [])
        library = library.filter(b => b.id !== id)
        store.set('library', library)
        return true
    })
}
