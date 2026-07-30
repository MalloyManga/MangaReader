import type { Book, OcrBlock } from '~/types/interface'

export type ExportScope = 'current' | 'all'

const loadImageElement = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('原始图片加载失败'))
    image.src = url
})

const drawVerticalText = (context: CanvasRenderingContext2D, block: OcrBlock) => {
    const text = Array.from(block.translation.trim())
    if (!text.length) return

    const { x, y, width, height } = block.rect
    const padding = Math.max(2, Math.min(width, height) * 0.04)
    const contentWidth = Math.max(1, width - padding * 2)
    const contentHeight = Math.max(1, height - padding * 2)
    let fontSize = Math.max(8, Math.sqrt((contentWidth * contentHeight * 0.62) / text.length))
    fontSize = Math.min(fontSize, contentWidth, contentHeight)

    let rows = 1
    let columns = text.length
    for (let attempt = 0; attempt < 40; attempt++) {
        const rowHeight = fontSize * 1.12
        const columnWidth = fontSize * 1.08
        rows = Math.max(1, Math.floor(contentHeight / rowHeight))
        columns = Math.ceil(text.length / rows)
        if (columns * columnWidth <= contentWidth) break
        fontSize *= 0.92
    }

    const rowHeight = fontSize * 1.12
    const columnWidth = fontSize * 1.08
    context.save()
    context.beginPath()
    context.rect(x, y, width, height)
    context.clip()
    context.fillStyle = '#111827'
    context.font = `500 ${fontSize}px "Microsoft YaHei", "Yu Gothic", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    text.forEach((character, index) => {
        const column = Math.floor(index / rows)
        const row = index % rows
        const drawX = x + width - padding - columnWidth * (column + 0.5)
        const drawY = y + padding + rowHeight * (row + 0.5)
        context.fillText(character, drawX, drawY)
    })
    context.restore()
}

const renderTranslatedPage = async (imageUrl: string, blocks: OcrBlock[]) => {
    const image = await loadImageElement(imageUrl)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建图片画布')
    context.drawImage(image, 0, 0)

    blocks
        .filter(block => block.status === 'done' && block.translation.trim())
        .forEach((block) => {
            context.fillStyle = '#ffffff'
            context.fillRect(block.rect.x, block.rect.y, block.rect.width, block.rect.height)
            drawVerticalText(context, block)
        })

    return canvas.toDataURL('image/png')
}

export const useTranslatedImageExport = () => {
    const { loadBookImages, releaseBookImages } = useBookSource()

    const getBookName = (book: Book) => {
        const filename = book.path.split(/[\\/]/).filter(Boolean).pop() || 'translated-manga'
        return filename.replace(/\.(pdf|zip)$/i, '')
    }

    const getExportablePageIndices = (book: Book, scope: ExportScope) => {
        const pages = book.autoTranslatePages || {}
        if (scope === 'current') return pages[String(book.currentPage)]?.some(
            block => block.status === 'done' && block.translation.trim()
        ) ? [book.currentPage] : []
        return Object.keys(pages)
            .map(Number)
            .filter(pageIndex => Number.isInteger(pageIndex) && pages[String(pageIndex)]?.some(
                block => block.status === 'done' && block.translation.trim()
            ))
            .sort((a, b) => a - b)
    }

    const exportBook = async (
        book: Book,
        scope: ExportScope,
        onProgress: (current: number, total: number, message: string) => void
    ) => {
        const pageIndices = getExportablePageIndices(book, scope)
        if (!pageIndices.length) throw new Error(scope === 'current' ? '当前页没有可导出的译文框' : '这本书还没有可导出的页面')

        const destination = await window.electronAPI.selectExportDirectory(getBookName(book))
        if (destination.canceled || !destination.directoryPath) return { canceled: true, exported: 0 }

        const images = await loadBookImages(book.path)
        let exported = 0
        try {
            for (let index = 0; index < pageIndices.length; index++) {
                const pageIndex = pageIndices[index]!
                const image = images[pageIndex]
                if (!image) continue
                onProgress(index, pageIndices.length, `正在生成第 ${pageIndex + 1} 页`)
                const imageDataUrl = await renderTranslatedPage(image.url, book.autoTranslatePages?.[String(pageIndex)] || [])
                const filename = `page-${String(pageIndex + 1).padStart(3, '0')}.png`
                const result = await window.electronAPI.saveExportedImage({
                    directoryPath: destination.directoryPath,
                    filename,
                    imageDataUrl
                })
                if (!result.success) throw new Error(result.error || `第 ${pageIndex + 1} 页保存失败`)
                exported++
                onProgress(index + 1, pageIndices.length, `已完成第 ${pageIndex + 1} 页`)
            }
        } finally {
            releaseBookImages(images)
        }
        return { canceled: false, exported, directoryPath: destination.directoryPath }
    }

    return { exportBook, getExportablePageIndices }
}
