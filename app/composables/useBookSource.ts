import type { ImageItem } from '~/types/interface'

export const useBookSource = () => {
    const { processImages, processZip, convertPdfToImages } = useFileProcessor()

    const loadBookImages = async (sourcePath: string): Promise<ImageItem[]> => {
        const extension = sourcePath.split('.').pop()?.toLowerCase() || ''
        if (extension === 'pdf') return convertPdfToImages(sourcePath)
        if (extension === 'zip') {
            const response = await fetch(`manga://${sourcePath}`)
            if (!response.ok) throw new Error(`ZIP 文件读取失败：${response.status}`)
            return processZip(await response.arrayBuffer())
        }

        const result = await window.electronAPI.readImageFiles([sourcePath])
        if (!result.success || !result.imagePaths) throw new Error(result.error || '书籍图片读取失败')
        return result.imagePaths.flatMap(imagePath => processImages(imagePath))
    }

    const releaseBookImages = (images: ImageItem[]) => {
        images.forEach((image) => {
            if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url)
        })
    }

    return { loadBookImages, releaseBookImages }
}
