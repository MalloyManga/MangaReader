import type { ImageItem } from '~/types/interface'

export const useMangaImages = () => {
    const images = useState<ImageItem[]>('manga-images', () => [])
    const currentImageIndex = useState<number>('manga-current-index', () => -1)
    const tempBookPath = useState<string | null>('manga-temp-path', () => null)
    const currentImage = computed(() => images.value[currentImageIndex.value])

    const addImagesToStore = (newImages: ImageItem[]) => {
        const wasEmpty = images.value.length === 0
        images.value.push(...newImages)
        if (wasEmpty) {
            currentImageIndex.value = 0
        }
    }

    const removeImage = (index: number) => {
        const image = images.value[index]
        if (image) {
            URL.revokeObjectURL(image.url)
            images.value.splice(index, 1)
            if (currentImageIndex.value > index) {
                currentImageIndex.value--
            } else if (images.value.length == 0) {
                currentImageIndex.value = -1
            }
            else if (currentImageIndex.value == images.value.length) {
                currentImageIndex.value--
            }
        }
    }

    const nextImage = () => {
        if (currentImageIndex.value < images.value.length - 1) {
            currentImageIndex.value++
        }
    }
    const prevImage = () => {
        if (currentImageIndex.value > 0) {
            currentImageIndex.value--
        }
    }
    const setImage = (index: number) => {
        if (index >= 0 && index < images.value.length) {
            currentImageIndex.value = index
        }
    }

    const clearImages = () => {
        images.value.forEach(img => {
            if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url)
        })
        images.value = []
        currentImageIndex.value = -1
        tempBookPath.value = null
    }

    return {
        images,
        currentImageIndex,
        currentImage,
        tempBookPath,
        nextImage,
        prevImage,
        setImage,
        addImagesToStore,
        removeImage,
        clearImages
    }
}
