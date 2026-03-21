<!-- components/ToastContainer.vue -->
<script setup lang="ts">
const { toasts } = useToast()
</script>

<template>
    <Teleport to="body">
        <!-- 始终挂载body上方同时不触发任何鼠标事件 -->
        <div class="fixed top-4 left-0 right-0 z-9999 pointer-events-none flex justify-center">
            <TransitionGroup name="list" tag="div" class="relative flex flex-col items-center w-full">
                <!-- 注意：这里我们给 ToolTip 加了一个 wrapper 或者直接加样式 -->
                <div v-for="toast in toasts" :key="toast.id" class="transition-all duration-500 ease-in-out mb-3">
                    <ToolTip :text="toast.text" />
                </div>
            </TransitionGroup>
        </div>
    </Teleport>
</template>

<style scoped>
.list-enter-from {
    opacity: 0;
    transform: translateY(-30px);
}

.list-leave-to {
    opacity: 0;
    transform: scale(0.8);
}

.list-leave-active {
    position: absolute;
    /* 离开的元素 需要脱离文档流来让出位置 不用指定定位css items-center发挥作用居中 */
    z-index: -1;
}

.list-move {
    transition: all 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}
</style>