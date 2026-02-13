<!-- components/ConfirmModal.vue -->
<script setup lang="ts">
interface Props {
    show: boolean
    title: string
    content: string
    confirmText?: string
    cancelText?: string
    isDanger?: boolean
    loading?: boolean
}

const {
    title = '确认操作',
    content = '你确定要执行此操作吗？',
    confirmText = '确定',
    cancelText = '取消',
    isDanger = false,
    loading = false
} = defineProps<Props>()

const emit = defineEmits<{
    confirm: []
    cancel: []
}>()
</script>

<template>
    <Teleport to="body">
        <Transition enter-active-class="transition duration-200 ease-out"
            leave-active-class="transition duration-150 ease-in" enter-from-class="opacity-0" leave-to-class="opacity-0"
            enter-to-class="opacity-100" leave-from-class="opacity-100">

            <!-- 遮罩层 -->
            <div v-if="show" class="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                @click="emit('cancel')">

                <!-- 弹窗卡片 -->
                <div class="w-full max-w-sm bg-white dark:bg-manga-800 rounded-xl shadow-2xl p-6 transform transition-all scale-100 border border-manga-200 dark:border-manga-700"
                    @click.stop>

                    <!-- 图标 标题 内容 -->
                    <div class="flex items-start gap-4 mb-4">
                        <div class="shrink-0 flex items-center justify-center size-10 rounded-full"
                            :class="isDanger ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-600'">
                            <IconWarn v-if="isDanger" class="size-6" />
                            <IconTip v-else class="size-6" />
                        </div>
                        <div>
                            <h3 class="text-lg font-bold text-manga-900 dark:text-white">
                                {{ title }}
                            </h3>
                            <p class="text-sm text-manga-500 dark:text-manga-400 mt-1">
                                {{ content }}
                            </p>
                        </div>
                    </div>

                    <!-- 取消及确认按钮 -->
                    <div class="flex justify-end gap-3 mt-6">
                        <Button @btn-click="emit('cancel')" :disabled="loading" variant="outline" size="sm">
                            {{ cancelText }}
                        </Button>
                        <Button @btn-click="emit('confirm')" :disabled="loading" variant="danger" size="sm"
                            :class="loading ? 'opacity-70 cursor-not-allowed' : ''">
                            <span v-if="loading"
                                class="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></span>
                            {{ confirmText }}
                        </Button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>
