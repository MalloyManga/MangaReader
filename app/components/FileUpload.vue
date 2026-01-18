<!-- components/FileUpload.vue -->
<script setup lang="ts">
import Sortable from 'sortablejs'
import JSZip from 'jszip'
import type { ImageItem } from '~/types/interface'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

const { showToast } = useToast()
const { images, currentImageIndex, addImagesToStore, setImage, removeImage: removeImageFromStore } = useMangaImages()

// 使用动态导入 PDF.js
const pdfjsLib = ref<any>(null)
const isPdfJsLoaded = ref(false)

const initPdfJs = async () => {
    if (isPdfJsLoaded.value || !import.meta.client) return
    try {
        const lib = await import('pdfjs-dist')
        pdfjsLib.value = lib

        // 配置 Worker
        lib.GlobalWorkerOptions.workerSrc = `${pdfWorker}`
        isPdfJsLoaded.value = true
        console.log('✅ PDF.js loaded successfully')
    } catch (error) {
        console.error('❌ Failed to load PDF.js:', error)
        showToast('PDF.js 加载失败，请重试', 2000)
    }
}

const listKey = ref(0)

// 模板引用
const dropArea = useTemplateRef<HTMLDivElement>('dropArea')
const imageContainer = useTemplateRef<HTMLDivElement>('imageContainer')
const imagesPreviewContainer = useTemplateRef<HTMLElement>('imagesPreviewContainer')

// 拖拽状态
const isDragging = ref(false)

// 图片容器的宽高
const containerSize = ref({ width: 0, height: 0 })

// 监听当前图片变化，更新容器尺寸
watch(() => images.value[currentImageIndex.value], () => {
    nextTick(() => {
        if (images.value.length > 0 && imageContainer.value) {
            const rect = imageContainer.value.getBoundingClientRect()
            containerSize.value = {
                width: rect.width,
                height: rect.height
            }
        }
    })
})

const handleDragOver = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
}

// PDF 转图片
const convertPdfToImages = async (file: File): Promise<ImageItem[]> => {
    if (!isPdfJsLoaded.value) {
        await initPdfJs()
    }

    if (!pdfjsLib.value) {
        throw new Error('PDF.js 加载失败')
    }

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.value.getDocument({ data: arrayBuffer }).promise
    const pageCount = pdf.numPages
    const images: ImageItem[] = []

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 2.0 }) // 2倍缩放提高清晰度

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
        }).promise

        // 转换为 Blob
        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), 'image/png')
        })

        const url = URL.createObjectURL(blob)
        const imageFile = new File([blob], `${file.name}_page_${pageNum}.png`, { type: 'image/png' })

        images.push({
            id: `${Date.now()}-${pageNum}-${Math.random()}`,
            url,
            file: imageFile,
            type: 'pdf-page',
            pageNumber: pageNum
        })
    }

    return images
}

// 添加图片
const addImages = async (files: File[]) => {
    const imageFilesToAdd: ImageItem[] = []
    const processFiles = async () => {
        for (const file of files) {
            try {
                // 处理 PDF 文件
                if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                    showToast(`正在处理 PDF: ${file.name}...`, 2000)
                    const pdfImages = await convertPdfToImages(file)
                    imageFilesToAdd.push(...pdfImages)
                    showToast(`PDF 转换完成: ${pdfImages.length} 页`, 2000)
                }
                // 处理 ZIP 文件
                else if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
                    const zip = await JSZip.loadAsync(file)
                    for (const filename in zip.files) {
                        const zipEntry = zip.files[filename]
                        if (zipEntry && !zipEntry.dir && /\.(jpe?g|png|gif|webp|bmp)$/i.test(zipEntry.name)) {
                            const blob = await zipEntry.async('blob')
                            const imageFile = new File([blob], zipEntry.name, { type: blob.type })
                            const id = `${Date.now()}-${Math.random()}`
                            const url = URL.createObjectURL(imageFile)
                            imageFilesToAdd.push({ id, url, file: imageFile, type: 'image' })
                        }
                    }
                }
                // 处理图片文件
                else if (file.type.startsWith('image/')) {
                    const id = `${Date.now()}-${Math.random()}`
                    const url = URL.createObjectURL(file)
                    imageFilesToAdd.push({ id, url, file, type: 'image' })
                }
            } catch (error) {
                console.error(`处理文件失败: ${file.name}`, error)
                showToast(`处理失败: ${file.name}`, 2000)
            }
        }

        // 统一添加图片到 ref
        if (imageFilesToAdd.length > 0) {
            addImagesToStore(imageFilesToAdd)
        }
    }

    await processFiles()
}

const handleDragEnter = (event: DragEvent) => {
    isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement
    if (dropArea.value && !dropArea.value.contains(relatedTarget)) {
        isDragging.value = false
    }
}

const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    isDragging.value = false

    const files = event.dataTransfer?.files
    if (files && files.length > 0) {
        addImages(Array.from(files))
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

const handleScreenshot = () => {
    if (!window.electronAPI) {
        showToast('截图功能仅在桌面版可用', 2000)
        return
    }
    window.electronAPI.send('window:capture-open')
}

// 监听截图完成事件
onMounted(() => {
    if (window.electronAPI) {
        window.electronAPI.on('screenshot:captured', (base64Data: string) => {
            fetch(base64Data)
                .then(res => res.blob())
                .then(blob => {
                    const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
                    addImages([file])
                })
                .catch(err => {
                    console.error('截图数据处理失败:', err)
                })
        })
    }
})

// 组件卸载时清理
onUnmounted(() => {
    images.value.forEach(img => URL.revokeObjectURL(img.url))
    if (sortableInstance) {
        sortableInstance.destroy()
        sortableInstance = null
    }
})
</script>

<template>
    <div class="h-full flex gap-3 items-stretch">
        <!-- 左侧缩略图列表 -->
        <div v-if="images.length > 0" class="flex flex-col gap-2" :style="{ height: containerSize.height + 'px' }">
            <div class="flex gap-2 w-full justify-between">
                <SelectImageButton @files-selected="addImages">
                    📁
                </SelectImageButton>
                <Button variant="secondary" class="p-2" @btn-click="handleScreenshot">✂️</Button>
            </div>
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
                class="lg:h-full w-full h-screen flex items-center justify-center">
                <img :src="images[currentImageIndex]?.url" :alt="`当前图片 ${currentImageIndex + 1}`" draggable="false"
                    class="object-contain size-full pointer-events-none select-none" :style="{
                        maxWidth: containerSize.width + 'px',
                        maxHeight: containerSize.height + 'px'
                    }" />

                <!-- 图片信息 -->
                <div
                    class="absolute top-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded text-sm backdrop-blur-sm pointer-events-none">
                    <div>{{ currentImageIndex + 1 }} / {{ images.length }}</div>
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
                        支持拖拽 <span class="font-bold">图片 / PDF / ZIP</span> 文件到此处
                    </p>

                    <div class="flex gap-3 justify-center">
                        <SelectImageButton @files-selected="addImages">
                            选择文件 📁
                        </SelectImageButton>
                        <Button variant="secondary" @btn-click="handleScreenshot">截图 ✂️</Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
