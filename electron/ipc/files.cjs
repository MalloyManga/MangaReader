// electron/ipc/files.cjs
// 漫画文件域:files:* 通道 纯 fs 操作,无状态,无 ctx 依赖

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')

module.exports = function registerFilesIpc() {

    // 用户点击按钮之后唤起dialog加载文件 仅仅返回路径给前端
    ipcMain.handle('files:read-images', async (_event,/** @type {string[]} */ filePaths) => {
        try {
            if (!filePaths || filePaths.length === 0) return { success: false, imagePaths: [] }
            const imagePaths = []
            const filePath = filePaths[0]
            if ((await fs.promises.stat(filePath)).isDirectory()) { // 如果为文件夹 则读取文件夹中所有图片的路径并排序 全部返回
                // 此时 filePath 即 filePaths[0] 为文件夹的路径
                const folderFilePaths = await fs.promises.readdir(filePath) // readdir 仅仅获取到文件名称及后缀
                const sortedFilePaths = folderFilePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
                for (const sortedFilePath of sortedFilePaths) {
                    const fileExt = sortedFilePath.split('.').pop().toLowerCase()
                    if (fileExt.match(/^(png|jpe?g|webp|gif)$/i)) {
                        const fullFilePath = path.join(filePath, sortedFilePath) // path.join拼接出完整的路径
                        imagePaths.push(fullFilePath)
                    }
                }
            }
            else {
                const folderPath = path.dirname(filePath)
                const folderFilePaths = await fs.promises.readdir(folderPath)
                const sortedFilePaths = folderFilePaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
                for (const sortedFilePath of sortedFilePaths) {
                    const fileExt = sortedFilePath.split('.').pop().toLowerCase()
                    if (fileExt.match(/^(png|jpe?g|webp|gif)$/i)) {
                        const fullFilePath = path.join(folderPath, sortedFilePath) // path.join拼接出完整的路径
                        imagePaths.push(fullFilePath)
                    }
                }
            }
            return { success: true, imagePaths }
        } catch (e) {
            return { success: false, error: e.message }
        }
    })

    ipcMain.handle('files:save-exported-image', async (_event, { directoryPath, filename, imageDataUrl }) => {
        try {
            const directoryStat = await fs.promises.stat(directoryPath)
            if (!directoryStat.isDirectory()) throw new Error('导出位置不是文件夹')
            const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl)
            if (!match) throw new Error('导出图片数据无效')
            const safeFilename = path.basename(filename).replace(/[<>:"/\\|?*]/g, '_')
            const extension = path.extname(safeFilename) || '.png'
            const baseName = path.basename(safeFilename, extension)
            let outputPath = path.join(directoryPath, `${baseName}${extension}`)
            let suffix = 1
            while (fs.existsSync(outputPath)) {
                outputPath = path.join(directoryPath, `${baseName}-${suffix}${extension}`)
                suffix++
            }
            await fs.promises.writeFile(outputPath, Buffer.from(match[1], 'base64'))
            return { success: true, path: outputPath }
        } catch (error) {
            return { success: false, error: error.message }
        }
    })
}
