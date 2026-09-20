import type { ImageItem } from '~/types/interface'
import { useI18n } from 'vue-i18n'

export const useBookSource = () => {
    const { t } = useI18n()
    const { processImages, processZip, convertPdfToImages } = useFileProcessor()

    const loadBookImages = async (sourcePath: string): Promise<ImageItem[]> => {
        const extension = sourcePath.split('.').pop()?.toLowerCase() || ''
        if (extension === 'pdf') return convertPdfToImages(sourcePath)
        if (extension === 'zip') {
            const response = await fetch(`manga://${sourcePath}`)
            if (!response.ok) throw new Error(t('readerWorkflow.zipReadFailed', { status: response.status }))
            return processZip(await response.arrayBuffer())
        }

        const result = await window.electronAPI.readImageFiles([sourcePath])
        if (!result.success || !result.imagePaths) throw new Error(result.error || t('readerWorkflow.bookImagesReadFailed'))
        return result.imagePaths.flatMap(imagePath => processImages(imagePath))
    }

    const releaseBookImages = (images: ImageItem[]) => {
        images.forEach((image) => {
            if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url)
        })
    }

    return { loadBookImages, releaseBookImages }
}
