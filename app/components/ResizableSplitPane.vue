<script setup lang="ts">
const props = withDefaults(defineProps<{
    defaultLeftPercent?: number
    minLeftPercent?: number
    maxLeftPercent?: number
    height?: string
    disabled?: boolean
}>(), {
    defaultLeftPercent: 60,
    minLeftPercent: 40,
    maxLeftPercent: 75,
    height: '100%',
    disabled: false
})

const container = useTemplateRef<HTMLElement>('container')
const leftPercent = ref(props.defaultLeftPercent)
const isDragging = ref(false)

const clampPercent = (value: number) => Math.min(
    props.maxLeftPercent,
    Math.max(props.minLeftPercent, value)
)

const updateFromPointer = (clientX: number) => {
    const rect = container.value?.getBoundingClientRect()
    if (!rect?.width) return
    leftPercent.value = clampPercent(((clientX - rect.left) / rect.width) * 100)
}

const stopDragging = () => {
    isDragging.value = false
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopDragging)
}

const handlePointerMove = (event: PointerEvent) => updateFromPointer(event.clientX)

const startDragging = (event: PointerEvent) => {
    if (props.disabled) return
    event.preventDefault()
    isDragging.value = true
    updateFromPointer(event.clientX)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
}

const handleKeydown = (event: KeyboardEvent) => {
    if (props.disabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    leftPercent.value = clampPercent(leftPercent.value + (event.key === 'ArrowRight' ? 1 : -1))
}

watch(() => props.defaultLeftPercent, value => {
    if (!isDragging.value) leftPercent.value = clampPercent(value)
})

onUnmounted(stopDragging)
</script>

<template>
    <div ref="container" class="resizable-split-pane min-h-0"
        :class="{ 'is-disabled': disabled, 'select-none': isDragging }"
        :style="{ '--split-left': `${leftPercent}%`, height }">
        <slot name="left" />

        <div v-if="!disabled" role="separator" aria-label="调整图片与功能区域宽度" aria-orientation="vertical"
            :aria-valuemin="minLeftPercent" :aria-valuemax="maxLeftPercent" :aria-valuenow="Math.round(leftPercent)"
            tabindex="0" class="split-handle group" @pointerdown="startDragging" @keydown="handleKeydown">
            <span class="split-handle-line group-hover:bg-primary group-focus:bg-primary" />
        </div>

        <slot v-if="!disabled" name="right" />
    </div>
</template>

<style scoped>
.resizable-split-pane {
    display: grid;
    grid-template-columns: minmax(0, var(--split-left)) 10px minmax(0, calc(100% - var(--split-left) - 10px));
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
}

.resizable-split-pane.is-disabled {
    display: block;
}

.split-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: col-resize;
    touch-action: none;
    outline: none;
}

.split-handle-line {
    width: 2px;
    height: 48px;
    border-radius: 2px;
    background: rgb(203 213 225);
    transition: background-color 150ms ease, height 150ms ease;
}

.split-handle:hover .split-handle-line,
.split-handle:focus .split-handle-line {
    height: 64px;
}

@media (max-width: 1023px) {
    .resizable-split-pane {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .split-handle {
        display: none;
    }

}
</style>
