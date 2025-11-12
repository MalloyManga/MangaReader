<!-- components/ImageUpload.vue -->
<script setup lang="ts">
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

const handleFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = input.files

    if (files && files.length > 0) {
        addImages(Array.from(files))
    }

    input.value = ''
}

// 添加图片
const addImages = (files: File[]) => {
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const id = `${Date.now()}-${Math.random()}`
            const url = URL.createObjectURL(file)
            images.value.push({ id, url, file })
        }
    })

    // 如果是第一次添加，显示第一张
    if (images.value.length === files.length) {
        currentImageIndex.value = 0
    }
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

// 组件卸载时清理 URL
onUnmounted(() => {
    images.value.forEach(img => URL.revokeObjectURL(img.url))
})

const handleScreenshot = () => { console.log('handleScreenshot') }
</script>

<template>
    <div class="h-full flex gap-3">
        <!-- 左侧缩略图列表 -->
        <div v-if="images.length > 0"
            class="w-24 flex flex-col gap-2 overflow-y-auto bg-manga-100 dark:bg-manga-800 p-2 rounded-primary border border-manga-200 dark:border-manga-600">
            <div v-for="(image, index) in images" :key="image.id"
                class="relative group cursor-pointer transition-all duration-200" @click="selectImage(index)">
                <!-- 缩略图 - 阻止被拖拽 -->
                <img :src="image.url" :alt="`图片 ${index + 1}`" draggable="false"
                    class="w-20 h-20 object-cover rounded border-2 transition-all select-none"
                    :class="index === currentImageIndex ? 'border-primary' : 'border-manga-300 dark:border-manga-600'" />

                <!-- 删除按钮 -->
                <button @click.stop="removeImage(index)"
                    class="absolute -top-1 -right-1 w-5 h-5 bg-red-400 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center text-xs hover:bg-red-500 cursor-pointer">
                    <IconDelete class="text-white size-1/2" />
                </button>

                <!-- 图片序号 -->
                <div
                    class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 text-center rounded-b">
                    {{ index + 1 }}
                </div>
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
                        <label class="inline-block">
                            <div
                                class="text-base transition-all duration-200 text-white cursor-pointer hover:opacity-90 hover:-translate-y-px hover:shadow-base px-4 py-2 bg-primary rounded-primary">
                                选择图片📁
                            </div>
                            <input type="file" accept="image/*" multiple @change="handleFileSelect" class="hidden">
                        </label>

                        <Button variant="secondary" @click="handleScreenshot">截图✂️</Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
