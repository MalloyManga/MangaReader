export default defineNuxtPlugin((nuxtApp) => {
    const router = useRouter()

    // 在路由解析之前拦截
    router.beforeEach((to, from, next) => {
        // 检查是否是 Electron 的文件路径路由
        // 修复：此时不能使用 fullPath，因为 fullPath 包含了 query 参数
        // 如果我们访问 /reader?path=E:/manga，fullPath 会包含 ':'，导致被错误拦截
        // 所以这里必须只检查 path 部分 (例如 path 为 '/index.html' 或 '/E:/...')
        if (to.path.includes('index.html') || to.path.includes(':')) {
            console.log('🚨 [Plugin] Detected file path route, redirecting to /', to.fullPath)
            return next('/')
        }
        next()
    })
})
