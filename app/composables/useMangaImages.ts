import type { ImageItem } from '~/types/interface'

export const useMangaImages = () => {
    // 全局状态：图片列表和当前索引
    const images = useState<ImageItem[]>('manga-images', () => [])
    const currentImageIndex = useState<number>('manga-current-index', () => 0)
    const tempBookPath = useState<string | null>('manga-temp-path', () => null)

    // 计算属性：当前图片对象
    const currentImage = computed(() => images.value[currentImageIndex.value])

    // 动作：下一张
    const nextImage = () => {
        if (currentImageIndex.value < images.value.length - 1) {
            currentImageIndex.value++
        }
    }

    // 动作：上一张
    const prevImage = () => {
        if (currentImageIndex.value > 0) {
            currentImageIndex.value--
        }
    }

    // 动作：跳转
    const setImage = (index: number) => {
        if (index >= 0 && index < images.value.length) {
            currentImageIndex.value = index
        }
    }

    const clearImages = () => {
        // Warning: Don't revoke URLs if they are base64 string, only blob:
        images.value.forEach(img => {
            if (img.url.startsWith('blob:')) URL.revokeObjectURL(img.url)
        })
        images.value = []
        currentImageIndex.value = 0
        tempBookPath.value = null
    }

    // 动作：添加图片
    const addImagesToStore = (newImages: ImageItem[]) => {
        const wasEmpty = images.value.length === 0
        images.value.push(...newImages)
        if (wasEmpty) {
            currentImageIndex.value = 0
        }
    }

    // 动作：移除图片
    const removeImage = (index: number) => {
        const img = images.value[index]
        if (img) {
            URL.revokeObjectURL(img.url)
            images.value.splice(index, 1)

            if (images.value.length === 0) {
                currentImageIndex.value = 0
            } else if (currentImageIndex.value >= images.value.length) {
                currentImageIndex.value = images.value.length - 1
            }
        }
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
