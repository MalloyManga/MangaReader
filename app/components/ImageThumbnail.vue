<!-- app/components/ImageThumbnail.vue -->
<script setup lang="ts">
interface ImageItem {
    id: string
    url: string
    file: File
}

interface Props {
    image: ImageItem
    index: number
    isActive: boolean
}

defineProps<Props>()

defineEmits<{
    delete: []
    select: []
}>()
</script>

<template>
    <div class="relative flex justify-center group cursor-pointer transition-all duration-200" @click="$emit('select')">
        <!-- 缩略图 -->
        <img :src="image.url" :alt="`图片 ${index + 1}`" draggable="false"
            class="w-20 h-20 object-cover rounded border-3 transition-all select-none"
            :class="isActive ? 'border-blue-600 dark:border-blue-400' : 'border-manga-300 dark:border-manga-600'" />

        <!-- 删除按钮 -->
        <button @click.stop="$emit('delete')"
            class="absolute -top-1 -right-1 w-5 h-5 bg-red-400 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center text-xs hover:bg-red-500 cursor-pointer z-10">
            <IconDelete class="text-white size-1/2" />
        </button>

        <!-- 图片序号 -->
        <div
            class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 text-center rounded-b pointer-events-none">
            {{ index + 1 }}
        </div>
    </div>
</template>
