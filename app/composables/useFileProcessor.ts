import type { ImageItem } from '~/types/interface.js'
import JSZip from 'jszip'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
type PDFJS = typeof import("e:/VS code/MangaReader/MangaReader/node_modules/pdfjs-dist/types/src/pdf")
const { showToast } = useToast()

export const useFileProcessor = () => {
    const isPdfJsLoaded = ref(false)
    const pdfjsLib = ref<PDFJS | null>(null)

    const processImages = (url: string, file?: File) => {
        const protocolUrl = `manga:///${url}`
        const tempImages: ImageItem[] = []
        tempImages.push({
            id: `${Date.now()}-${Math.random()}`,
            url: protocolUrl,
            file: file || new File([], ''), // file字段实际上没有任何作用 new File仅作占位
            type: 'image'
        })
        return tempImages
    }

    // 解压zip文件 同时构建标准的 ImageItem 数组
    const processZip = async (file: File | ArrayBuffer) => {
        const zip = await JSZip.loadAsync(file)
        const tempImages: ImageItem[] = []
        for (const [_filePath, zipObj] of Object.entries(zip.files)) {
            if (!zipObj.dir && /\.(png|jpe?g|webp|gif)$/i.test(zipObj.name)) {
                const blob = await zipObj.async('blob')
                const url = URL.createObjectURL(blob)
                const imageFile = new File([blob], zipObj.name, { type: blob.type })
                tempImages.push({
                    id: `${Date.now()}-${Math.random()}`,
                    url: url,
                    file: imageFile,
                    type: 'image'
                })
            }
        }
        return tempImages
    }

    // 初始化pdf库
    const initPdfJs = async () => {
        if (isPdfJsLoaded.value || !import.meta.client) return
        try {
            // 动态引入并配置worker
            const lib = await import('pdfjs-dist')
            lib.GlobalWorkerOptions.workerSrc = `${pdfWorker}`
            // 配置完毕后赋值给全局变量pdfjsLib
            pdfjsLib.value = lib
            isPdfJsLoaded.value = true
            console.log('✅ PDF.js loaded successfully')
        } catch (error) {
            console.error('❌ Failed to load PDF.js:', error)
            showToast('PDF.js 加载失败，请重试', 2000)
        }
    }
    // PDF 转图片
    const convertPdfToImages = async (url: string): Promise<ImageItem[]> => {
        if (!isPdfJsLoaded.value) {
            await initPdfJs()
        }
        if (!pdfjsLib.value) {
            throw new Error('PDF.js 加载失败')
        }

        const pdf = await pdfjsLib.value.getDocument(url).promise
        const pageCount = pdf.numPages

        // 构建图片数组
        const images: ImageItem[] = []

        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            const page = await pdf.getPage(pageNum)
            const viewport = page.getViewport({ scale: 2.0 })
            // pdf页面的尺寸与电脑屏幕页面的尺寸(像素)没有任何关联 故使用getViewport来进行映射转换 得到一个 PageViewport 对象 pdf的尺寸进行了 scale 的变换之后得到了以像素为单位的尺寸 并将该尺寸指定给canvas

            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')!
            canvas.width = viewport.width
            canvas.height = viewport.height

            await page.render({
                canvasContext: context,
                viewport: viewport,
                canvas: canvas
            }).promise

            // 转换为 Blob
            const blob = await new Promise<Blob>((resolve) => {
                canvas.toBlob((blob) => resolve(blob!), 'image/png')
            })
            // toBlob 是将canvas上的图转换为图片 一参回调函数获得一个blob对象 是图片的二进制数据 二参是类型string可以指定图片的格式
            // 同时 toBlob 异步操作图片 兑现之后在一参回调函数里resolve 将blob返回给promise的兑现
            const url = URL.createObjectURL(blob)
            const imageFile = new File([blob], `${Date.now()}_${Math.random()}`, { type: 'image/png' })

            images.push({
                id: `${Date.now()}-${pageNum}-${Math.random()}`,
                url,
                file: imageFile,
                type: 'pdf-page',
                pageNumber: pageNum
            })
        }
        return images
    }

    return {
        processImages,
        processZip,
        convertPdfToImages
    }
}