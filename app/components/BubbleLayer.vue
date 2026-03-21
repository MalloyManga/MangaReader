<!-- components/BubbleLayer.vue -->
<script setup lang="ts">
import type { OcrBlock } from '~/types/interface'
interface Props {
    blocks: OcrBlock[]
    imageNaturalSize: { width: number, height: number }
    containerSize: { width: number, height: number }
}
const { blocks, imageNaturalSize, containerSize } = defineProps<Props>()

const renderedRect = computed(() => {
    const { width: nw, height: nh } = imageNaturalSize
    const { width: cw, height: ch } = containerSize

    if (!nw || !nh || !cw || !ch) return { x: 0, y: 0, width: 0, height: 0, scale: 1 }

    // 由于原始图片宽高比再经过了 objectcontain 的调整之后会缩水 故这里进行计算scale
    const rw = cw / nw
    const rh = ch / nh
    const scale = Math.min(rw, rh)
    // 计算实际缩放 由于原图宽高比不变 故缩放比例为最小的那个
    // actualWH 便为最后缩放之后的图片宽高
    const actualW = nw * scale
    const actualH = nh * scale

    // 缩放之后 容器两边的留白
    const x = (cw - actualW) / 2
    const y = (ch - actualH) / 2

    return { x, y, width: actualW, height: actualH, scale }
})

const getBlockStyle = (block: OcrBlock) => {
    // 拿到容器里的图片四周的留白宽高 以及 图片的缩放比例
    const { x, y, scale } = renderedRect.value

    const text = block.showOriginal ? block.original : (block.translation || '...')
    const len = Math.max(1, text.length)

    const w = block.rect.width * scale
    const h = block.rect.height * scale
    // block.rect.x 是这块文字在原图里的坐标
    const area = w * h

    let fontSize = Math.sqrt((area * 0.60) / len)

    return {
        left: `${x + block.rect.x * scale}px`,
        top: `${y + block.rect.y * scale}px`,
        width: `${w}px`,
        height: `${h}px`,
        fontSize: `${fontSize}px`
    }
}

const handleSingleClick = (block: OcrBlock) => {
    toggleContent(block)
}

const handleDoubleClick = (block: OcrBlock) => {
    emit('reOcr', block.id)
}

const handleRightClick = (block: OcrBlock) => {
    emit('deleteBlock', block.id)
}

const toggleContent = (block: OcrBlock) => {
    const newBlock = { ...block, showOriginal: !block.showOriginal }
    emit('updateBlock', newBlock)
    emit('selectBlock', block.id)
}

const emit = defineEmits<{
    updateBlock: [block: OcrBlock]
    deleteBlock: [id: string]
    selectBlock: [id: string]
    reOcr: [id: string]
}>()
</script>

<template>
    <div class="absolute inset-0 pointer-events-none z-20 overflow-hidden">
        <TransitionGroup name="bubble">
            <div v-for="block in blocks" :key="block.id"
                class="absolute pointer-events-auto cursor-pointer select-none transition-all hover:ring-2 hover:ring-primary overflow-hidden flex flex-col"
                :class="[
                    block.showOriginal
                        ? 'bg-transparent border-2 border-primary/50 border-dashed z-30'
                        : 'bg-white shadow-sm border border-gray-200 z-20'
                ]" :style="getBlockStyle(block)" @click.stop="handleSingleClick(block)"
                @dblclick.stop="handleDoubleClick(block)" @contextmenu.prevent.stop="handleRightClick(block)">
                <!-- 垂直排版容器 -->
                <!-- 仅在非原文模式(showOriginal=false)下显示文本 -->
                <div v-if="!block.showOriginal"
                    class="flex-1 w-full h-full p-[2%] writing-vertical-rl break-all leading-tight tracking-tighter flex flex-wrap items-center justify-start content-center text-left">
                    <span v-if="block.status === 'loading'" class="text-xs text-gray-400">...</span>
                    <!-- 译文 -->
                    <span v-else class="font-medium text-gray-900">
                        {{ block.translation || '...' }}
                    </span>
                </div>
            </div>
        </TransitionGroup>
    </div>
</template>

<style scoped>
.writing-vertical-rl {
    writing-mode: vertical-rl;
    text-orientation: upright;
}

.bubble-enter-active,
.bubble-leave-active {
    transition: all 0.3s ease;
}

.bubble-enter-from,
.bubble-leave-to {
    opacity: 0;
    transform: scale(0.9);
}
</style>
