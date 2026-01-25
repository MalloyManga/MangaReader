<!-- app/components/SelectImageButton.vue -->
<script setup lang="ts">
const emit = defineEmits<{
    // 抛出一个 files-selected 的事件 并带有类型为File[]的参数
    (e: 'files-selected', files: File[]): void
}>()

const handleFileSelect = (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = input.files

    if (files && files.length > 0) {
        emit('files-selected', Array.from(files))
    }

    // 重置 input，以便可以再次选择相同的文件
    input.value = ''
}

const props = defineProps<{
    directory?: boolean
}>()
</script>

<template>
    <label class="inline-block relative">
        <div
            class="text-base transition-all duration-200 text-white cursor-pointer hover:opacity-90 hover:-translate-y-px hover:shadow-base px-4 py-2 bg-primary rounded-primary active:scale-95">
            <slot>选择文件</slot>
        </div>
        <input v-if="directory" type="file" webkitdirectory directory multiple @change="handleFileSelect"
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
        <input v-else type="file" accept="image/*,.zip,.pdf" multiple @change="handleFileSelect" class="hidden">
    </label>
</template>
