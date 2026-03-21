// composables/useToast.ts
interface ToastMessage {
    id: number
    text: string
    duration: number
}

const toasts = ref<ToastMessage[]>([])
let toastId = 0

export const useToast = () => {
    // showToast 用于添加toast，toasts 为所有添加的toast的数组
    const showToast = (text: string, duration = 1500) => {
        const id = toastId++
        // 新的 toast 插入到数组开头（最上方）
        toasts.value.unshift({ id, text, duration })

        setTimeout(() => {
            // 离开动画外部控制 这里直接删除
            toasts.value = toasts.value.filter(t => t.id !== id)
        }, duration)
    }

    return {
        toasts: readonly(toasts),
        showToast
    }
}
