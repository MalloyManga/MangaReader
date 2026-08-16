// electron/ipc/protocol.cjs
// manga:// 自定义图片协议 无状态 无 ctx 依赖
// 注意:schema 特权声明(registerSchemesAsPrivileged)必须保留在 app ready 之前 仍在 main.cjs 中

const { protocol, net } = require('electron')
const url = require('url')

module.exports = function registerMangaProtocol() {

    // 自建图片协议 拦截mnaga:// 请求
    protocol.handle('manga', async (request) => {
        try {
            // 1. 截掉 'manga://' 头
            let rawPath = request.url.slice('manga://'.length)

            // 2. 解码 把浏览器自动编码的 %E3%83 还原回真实的汉字/日文
            rawPath = decodeURIComponent(rawPath)

            // 3. 修复盘符 如果浏览器把 C:/ 吞成了 c/ 我们手动补上冒号
            // 正则解释 如果开头是一个字母紧跟一个斜杠 (比如 c/ 或 d/)
            if (/^[a-zA-Z]\//.test(rawPath)) {
                // 在字母和斜杠中间插入冒号 -> c:/
                rawPath = rawPath[0] + ':' + rawPath.slice(1)
            }

            // 4. 使用 Node.js 官方 API 转换为标准 file:// 协议
            // pathToFileURL 需要接收绝对纯净的本地路径 (例如 C:\Users\测试\1.png)
            const fileUrl = url.pathToFileURL(rawPath).href

            // 返回本地文件流
            return net.fetch(fileUrl)

        } catch (e) {
            console.error('加载本地图片出错 URL:', request.url)
            console.error('详细错误:', e)
            return new Response('File not found', { status: 404 })
        }
    })
}
