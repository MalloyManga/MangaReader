<!-- components/FileUpload.vue -->
<script setup lang="ts">
import Sortable from 'sortablejs'
import type { ImageItem } from '~/types/interface'
const { showToast } = useToast()
const { images, currentImageIndex, addImagesToStore, setImage, removeImage: removeImageFromStore, tempBookPath } = useMangaImages()
const { processImages, processZip, convertPdfToImages } = useFileProcessor()

const listKey = ref(0)

// 模板引用
const dropArea = useTemplateRef<HTMLDivElement>('dropArea')
const imageContainer = useTemplateRef<HTMLDivElement>('imageContainer')
const imagesPreviewContainer = useTemplateRef<HTMLElement>('imagesPreviewContainer')

const isDragging = ref(false)

// 图片容器的宽高
const containerSize = reactive({ width: 0, height: 0 })
const imageNaturalSize = reactive({ width: 0, height: 0 })
let resizeObserver: ResizeObserver | null = null

const updateContainerSize = () => {
    if (imageContainer.value) {
        containerSize.width = imageContainer.value.clientWidth
        containerSize.height = imageContainer.value.clientHeight
    }
}

const onImageLoad = (e: Event) => {
    const img = e.target as HTMLImageElement
    imageNaturalSize.width = img.naturalWidth
    imageNaturalSize.height = img.naturalHeight
}

watch(imageContainer, (el) => {
    if (el) {
        updateContainerSize()
        if (resizeObserver) resizeObserver.disconnect()
        resizeObserver = new ResizeObserver(updateContainerSize)
        resizeObserver.observe(el)
    }
})

// 监听当前图片变化
watch(() => images.value[currentImageIndex.value], () => {
    nextTick(updateContainerSize)
})

onMounted(() => {
    window.addEventListener('resize', updateContainerSize)
})

// 这里data为File[] string[] 当中任选一个 可能需要重构
const storePath = (data: File[] | string[]) => {
    // 存储来源路径 保存到书架 不论类型
    // data为File数组
    if (data[0] instanceof File) {
        if (data && data[0]) {
            const filePath = window.electronAPI.getPathForFile(data[0])
            if (data[0].name.endsWith('.pdf') || data[0].type == 'application/pdf' || data[0].name.endsWith('.zip') || data[0].type == 'application/zip') { // 当文件为pdf zip时 直接存储路径
                tempBookPath.value = filePath
            }
            else if (data[0].type.startsWith('image/')) {
                // 文件为图片时获取到父级文件夹路径存储
                const index = filePath.replaceAll('\\', '/').lastIndexOf('/')
                const fileFolderPath = filePath.substring(0, index)
                tempBookPath.value = fileFolderPath
            }
            else if (data[0].type == '') { // 如果是文件夹直接存储
                tempBookPath.value = filePath
            }
        }
    }
    // data为路径数组
    else if (typeof data[0] == 'string') {
        const fileExt = data[0].split('.').pop()?.toLowerCase() || ''
        if (fileExt.endsWith('pdf') || fileExt.endsWith('zip')) {
            tempBookPath.value = data[0]
        }
        else if (fileExt.match(/^(png|jpe?g|webp|gif)$/i)) {
            const index = data[0].replaceAll('\\', '/').lastIndexOf('/')
            tempBookPath.value = data[0].substring(0, index)
        }
    }
}

// 点击按钮打开dialog导入图片(得到参数为路径数组 string[])
const handleOpenFile = async () => {
    if (!window.electronAPI) return
    try {
        const { canceled, filePaths } = await window.electronAPI.openFileDialog()

        if (canceled || filePaths.length === 0) return
        showToast('正在加载文件...', 2000)

        const res = await window.electronAPI.readImageFiles(filePaths)
        if (res.success && res.imagePaths) {
            storePath(res.imagePaths)
            const files: ImageItem[] = []
            for (const filePath of res.imagePaths) {
                const fileExt = filePath.split('.').pop()?.toLowerCase() || ''
                if (fileExt.match(/^(png|jpe?g|webp|gif)$/i)) {
                    files.push(...processImages(filePath))
                }
                else if (fileExt.endsWith('pdf')) {
                    // const arrayBuffer = await (await fetch(`manga://${filePath}`)).arrayBuffer()
                    const tempImages = await convertPdfToImages(`manga://${filePath}`)
                    files.push(...tempImages)
                }
                else if (fileExt.endsWith('zip')) {
                    const arrayBuffer = await (await fetch(`manga://${filePath}`)).arrayBuffer()
                    files.push(...(await processZip(arrayBuffer)))
                }
            }
            if (files.length > 0) {
                addImagesToStore(files)
            }
            showToast(`✅ 加载成功`)
        } else {
            showToast('加载失败: ' + res.error)
        }
    } catch (e) {
        console.error(e)
        showToast('打开文件出错')
    }
}

// 拖拽导入图片(得到参数为 File[])
const addImages = async (files: File[]) => {
    // 存储来源路径 保存到书架 不论类型
    storePath(files)

    const processOneFile = async (file: File): Promise<ImageItem[]> => {
        const tempImages: ImageItem[] = []
        try {
            const filePath = window.electronAPI.getPathForFile(file)
            const fileExt = filePath.split('.').pop()?.toLowerCase() || ''
            // pdf
            if (fileExt.endsWith('pdf') && file.type == 'application/pdf') {
                showToast(`正在处理PDF: ${file.name}`, 2000)
                // const arrayBuffer = await file.arrayBuffer()
                const pdfToImages = await convertPdfToImages(filePath)
                showToast(`PDF转换完成 ${pdfToImages.length} 页`, 2000)
                tempImages.push(...pdfToImages)
            }
            // zip包
            else if (fileExt.endsWith('zip') && file.type == 'application/zip') {
                showToast(`正在解压 ${file.name}`, 3000)
                tempImages.push(...(await processZip(file)))
            }
            // 图片
            else if (file.type.startsWith('image/')) {
                tempImages.push(...processImages(filePath, file))
            }
            // 文件夹 文件夹仅有一个路径 故依靠后端读取文件能力处理
            else if (file.type == '') {
                const res = await window.electronAPI.readImageFiles([filePath])
                if (res.success && res.imagePaths) {
                    for (const imagePath of res.imagePaths) {
                        tempImages.push(...processImages(imagePath))
                    }
                }
            }
            return tempImages
        } catch (error) {
            console.error(`文件处理失败: ${file.name}`, error)
            showToast(`导入中断！ 文件 ${file.name} 损坏 请修复之后再次尝试导入！`, 5000)
            throw error
        }
    }

    const tasks = files.map((file) => {
        return processOneFile(file)
    })
    const results = (await Promise.all(tasks)).flat()
    if (results.length > 0) {
        addImagesToStore(results)
    }
}

// 切换到指定图片
const selectImage = (index: number) => {
    setImage(index)
}

// 删除图片
const removeImage = (index: number) => {
    removeImageFromStore(index)
}

// Sortable 实例
let sortableInstance: Sortable | null = null

watch([() => images.value.length, listKey], () => {
    nextTick(() => {
        if (sortableInstance) {
            sortableInstance.destroy()
            sortableInstance = null
        }

        if (images.value.length > 0 && imagesPreviewContainer.value) {
            sortableInstance = Sortable.create(imagesPreviewContainer.value, {
                animation: 150,
                onEnd: (event) => {
                    const { oldIndex, newIndex } = event
                    if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return

                    const movingItem = images.value[oldIndex]
                    if (movingItem) {
                        images.value.splice(oldIndex, 1)
                        images.value.splice(newIndex, 0, movingItem)
                    }

                    if (currentImageIndex.value === oldIndex) {
                        currentImageIndex.value = newIndex
                    } else if (oldIndex < currentImageIndex.value && newIndex >= currentImageIndex.value) {
                        currentImageIndex.value -= 1
                    } else if (oldIndex > currentImageIndex.value && newIndex <= currentImageIndex.value) {
                        currentImageIndex.value += 1
                    }

                    listKey.value++
                }
            })
        }
    })
})

// const handleScreenshot = () => {
//     if (!window.electronAPI) {
//         showToast('截图功能仅在桌面版可用', 2000)
//         return
//     }
//     window.electronAPI.send('window:capture-open')
// }

// 监听截图完成事件
// onMounted(() => {
//     if (window.electronAPI) {
//         window.electronAPI.on('screenshot:captured', (base64Data: string) => {
//             fetch(base64Data)
//                 .then(res => res.blob())
//                 .then(blob => {
//                     const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
//                     addImages([file])
//                 })
//                 .catch(err => {
//                     console.error('截图数据处理失败:', err)
//                 })
//         })
//     }
// })

// 组件卸载时清理
onUnmounted(() => {
    window.removeEventListener('resize', updateContainerSize)
    if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
    }
    images.value.forEach(img => URL.revokeObjectURL(img.url))
    if (sortableInstance) {
        sortableInstance.destroy()
        sortableInstance = null
    }
})

// 所有的拖动函数
// - 进入离开时isDragging变化
const handleDragEnter = (_event: DragEvent) => {
    isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
    // relatedTarget随着鼠标的移动会进行即时判断
    // !dropArea.value.contains(relatedTarget) - 离开之后所进入的元素 并不包含在dropArea内的时间触发 排除掉从父元素即dropArea进入子元素的情况
    const relatedTarget = event.relatedTarget as HTMLElement // 这里的relatedTarget在ts看来可能并非Node 但实际上这里不存在除了HTMLElement以外的情况 故断言为
    if (!dropArea.value?.contains(relatedTarget)) {
        isDragging.value = false
    }
}

const handleDragOver = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
}

const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    isDragging.value = false

    const files = event.dataTransfer?.files
    if (files && files.length > 0) {
        addImages(Array.from(files))
    }
}
// --------------
</script>

<template>
    <div class="h-full flex gap-3 items-stretch">

        <!-- 左侧缩略图列表 -->
        <div v-if="images.length > 0" class="flex flex-col gap-2" :style="{ height: containerSize.height + 'px' }">
            <!-- <div class="flex gap-2 w-full justify-between">
                <Button @btn-click="handleOpenFile">
                    📂
                </Button>
                <Button variant="secondary" class="p-2" @btn-click="handleScreenshot">
                    ✂️
                </Button>
            </div> -->
            <div ref="imagesPreviewContainer" :key="listKey"
                class="gap-2 min-h-0 bg-manga-100 dark:bg-manga-800 p-2 rounded-primary border border-manga-200 dark:border-manga-600 overflow-y-auto">
                <ImageThumbnail v-for="(image, index) in images" :key="image.id" :image="image" :index="index"
                    :is-active="index === currentImageIndex" @select="selectImage(index)"
                    @delete="removeImage(index)" />
            </div>
        </div>

        <!-- 主预览区域 -->
        <div ref="dropArea" @dragover="handleDragOver" @dragenter="handleDragEnter" @dragleave="handleDragLeave"
            @drop="handleDrop" class="flex-1 transition-all duration-200 shadow-base border rounded-primary relative"
            :class="[
                isDragging
                    ? 'border-primary border-2 bg-primary/10'
                    : 'border-manga-200 dark:border-manga-500 bg-manga-50 dark:bg-manga-700'
            ]">

            <!-- 有图片时显示 -->
            <div v-if="images.length > 0" ref="imageContainer"
                class="size-full flex items-center justify-center relative">
                <img :src="images[currentImageIndex]?.url" :alt="`当前图片 ${currentImageIndex + 1}`" draggable="false"
                    @load="onImageLoad" class="object-contain size-full pointer-events-none select-none" :style="{
                        maxWidth: containerSize.width + 'px',
                        maxHeight: containerSize.height + 'px'
                    }" />

                <!-- 列表/沉浸模式的翻译气泡框slot 覆盖掉原本图片的原文 -->
                <slot name="overlay" :natural-size="imageNaturalSize" :container-size="containerSize"></slot>

                <!-- 右上图片/pdf页码信息 -->
                <div
                    class="absolute top-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded text-sm backdrop-blur-sm pointer-events-none">
                    <div>
                        {{ currentImageIndex + 1 }} / {{ images.length }}
                    </div>
                    <div v-if="images[currentImageIndex]?.type === 'pdf-page'" class="text-xs opacity-75">
                        PDF 第 {{ images[currentImageIndex]?.pageNumber }} 页
                    </div>
                </div>

            </div>

            <!-- 空状态 -->
            <div v-else class="h-full flex items-center justify-center p-8">
                <div class="text-center">
                    <div class="text-6xl mb-4">
                        <span v-if="isDragging">📥</span>
                        <span v-else>📤</span>
                    </div>
                    <p class="text-lg mb-2 text-manga-900 dark:text-manga-100">
                        {{ isDragging ? '松开鼠标上传' : '文件预览区域' }}
                    </p>
                    <p class="text-sm mb-6 text-manga-600 dark:text-manga-400">
                        支持拖拽
                        <span class="font-bold">
                            图片 / PDF / ZIP
                        </span>
                        文件到此处<br>
                        或点击下方按钮导入
                    </p>

                    <div class="flex gap-3 justify-center">
                        <Button @btn-click="handleOpenFile">
                            导入 / 打开文件 📁
                        </Button>
                        <!-- <Button variant="secondary" @btn-click="handleScreenshot">
                            截图 ✂️
                        </Button> -->
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
