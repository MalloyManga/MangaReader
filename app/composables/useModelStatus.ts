// composables/useModelStatus.ts
const modelState = reactive({
    id: 'sakura-1.5b',
    name: 'Sakura-1.5B-Qwen2.5',
    size: '1.2 GB',
    description: '推荐。专为轻小说/漫画微调，速度快，体积小。',
    status: 'unknown', // unknown | checking | downloaded | not_downloaded | downloading
    progress: 0
})

export function useModelStatus() {

    // force: 是否强制显示“检查中”转圈圈
    const checkModelStatus = async (force = false) => {
        // 策略：
        // 1. 如果是未知状态 (第一次打开)，必须显示 checking
        // 2. 如果强制刷新 (force=true)，必须显示 checking
        // 3. 其他情况 (比如已经是 downloaded)，我们就在后台静默检查，不让用户看到转圈
        if (modelState.status === 'unknown' || force) {
            modelState.status = 'checking'
        }

        try {
            // 后台静默发送请求
            const res = await window.electronAPI.checkModel()

            if (res.success && res.exists) {
                modelState.status = 'downloaded'
                modelState.progress = 100
            } else {
                modelState.status = 'not_downloaded'
                modelState.progress = 0
            }
        } catch (e) {
            console.error("Model check failed:", e)
            modelState.status = 'not_downloaded'
        }
    }

    return {
        model: modelState,
        checkModelStatus
    }
}