<!-- components/ImageUpload.vue -->
<script setup lang="ts">
import Sortable from 'sortablejs'
import JSZip from 'jszip'
import ImageThumbnail from './ImageThumbnail.vue'

interface ImageItem {
    id: string
    url: string
    file: File
}

// 图片列表
const images = ref<ImageItem[]>([])
// 当前显示的图片索引
const currentImageIndex = ref(0)

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

// 添加图片
const addImages = (files: File[]) => {
    const imageFilesToAdd: File[] = []

    const processFiles = async () => {
        for (const file of files) {
            // 如果是 zip 文件
            if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
                try {
                    const zip = await JSZip.loadAsync(file)
                    // 遍历 zip 内的文件
                    for (const filename in zip.files) {
                        const zipEntry = zip.files[filename]
                        // 确保是文件且是图片类型
                        if (zipEntry && !zipEntry.dir && /\.(jpe?g|png|gif|webp|bmp)$/i.test(zipEntry.name)) {
                            const blob = await zipEntry.async('blob')
                            const imageFile = new File([blob], zipEntry.name, { type: blob.type })
                            imageFilesToAdd.push(imageFile)
                        }
                    }
                } catch (e) {
                    console.error("解压失败:", e)
                }
            }
            // 如果是图片文件
            else if (file.type.startsWith('image/')) {
                imageFilesToAdd.push(file)
            }
        }

        // 统一添加图片到 ref
        if (imageFilesToAdd.length > 0) {
            const wasEmpty = images.value.length === 0
            imageFilesToAdd.forEach(file => {
                const id = `${Date.now()}-${Math.random()}`
                const url = URL.createObjectURL(file)
                images.value.push({ id, url, file })
            })

            // 如果是第一次添加，显示第一张
            if (wasEmpty) {
                currentImageIndex.value = 0
            }
        }
    }

    processFiles()
}

const handleDragEnter = (event: DragEvent) => {

    isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement

    if (dropArea.value && !dropArea.value.contains(relatedTarget)) {
        // 模板引用的类型守卫
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
    currentImageIndex.value = index
}

// 删除图片
const removeImage = (index: number) => {
    const img = images.value[index]
    if (img) {
        URL.revokeObjectURL(img.url)
        images.value.splice(index, 1)

        // 调整当前索引
        if (images.value.length === 0) {
            currentImageIndex.value = 0
        } else if (currentImageIndex.value >= images.value.length) {
            currentImageIndex.value = images.value.length - 1
        }
    }
}

// 保存 Sortable 实例
let sortableInstance: Sortable | null = null

// 监听 images 数组的长度
watch(() => images.value.length, (newLength) => {
    // 使用 nextTick 确保 DOM 已经更新
    nextTick(() => {
        if (newLength > 0 && imagesPreviewContainer.value) {
            // 如果实例不存在，则创建
            if (!sortableInstance) {
                sortableInstance = Sortable.create(imagesPreviewContainer.value, {
                    animation: 150,
                    // 关键：在拖拽结束时触发
                    onEnd: (event) => {
                        const { oldIndex, newIndex } = event

                        // 检查索引是否存在
                        if (oldIndex === undefined || newIndex === undefined) return

                        // 1. 从数组中移除被拖拽的项
                        const itemToMove = images.value.splice(oldIndex, 1)[0]
                        if (itemToMove) { // 添加了安全检查
                            // 2. 将其添加到新的位置
                            images.value.splice(newIndex, 0, itemToMove)
                        }

                        // 拖拽后可能需要更新当前选中的索引
                        // 如果你拖拽的是当前选中的图片，需要更新 currentImageIndex
                        if (currentImageIndex.value === oldIndex) {
                            currentImageIndex.value = newIndex
                        }
                    }
                })
            }
        } else if (newLength === 0 && sortableInstance) {
            // 如果图片被清空，销毁 Sortable 实例
            sortableInstance.destroy()
            sortableInstance = null
        }
    })
})

// 组件卸载时清理 URL
onUnmounted(() => {
    images.value.forEach(img => URL.revokeObjectURL(img.url))
    if (sortableInstance) {
        sortableInstance.destroy()
    }
})

const handleScreenshot = () => { console.log('handleScreenshot') }
</script>

<template>
    <div class="h-full flex gap-3 items-stretch">
        <!-- 左侧缩略图列表 -->
        <div v-if="images.length > 0" ref="imagesPreviewContainer" class="flex flex-col gap-2"
            :style="{ height: containerSize.height + 'px' }">
            <!-- 这里可能要改一下 滚动条样式 这里待调整 目前没有更好的方法 -->
            <div class="flex gap-2 w-full justify-between">
                <SelectImageButton @files-selected="addImages">
                    📁
                </SelectImageButton>
                <Button variant="secondary" class="p-2" @click="handleScreenshot">✂️</Button>
            </div>
            <div
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
            <div v-if="images.length > 0" ref="imageContainer" class="h-full w-full flex items-center justify-center">
                <!-- 阻止图片被拖拽 -->
                <img :src="images[currentImageIndex]?.url" :alt="`当前图片 ${currentImageIndex + 1}`" draggable="false"
                    class="object-contain size-auto pointer-events-none select-none" :style="{
                        maxWidth: containerSize.width + 'px',
                        maxHeight: containerSize.height + 'px'
                    }" />

                <!-- 图片信息 -->
                <div
                    class="absolute top-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded text-sm backdrop-blur-sm pointer-events-none">
                    {{ currentImageIndex + 1 }} / {{ images.length }}
                </div>
            </div>

            <!-- 空状态 -->
            <div v-else class="h-full flex items-center justify-center p-8">
                <div class="text-center">
                    <div class="text-6xl mb-4">
                        <span v-if="isDragging"></span>
                        <span v-else>📤</span>
                    </div>
                    <p class="text-lg mb-2 text-manga-900 dark:text-manga-100">
                        {{ isDragging ? '松开鼠标上传' : '图片预览区域' }}
                    </p>
                    <p class="text-sm mb-6 text-manga-600 dark:text-manga-400">拖拽图片到此处</p>

                    <div class="flex gap-3 justify-center">
                        <SelectImageButton @files-selected="addImages">
                            选择图片📁
                        </SelectImageButton>
                        <Button variant="secondary" @click="handleScreenshot">截图✂️</Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
