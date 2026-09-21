// 嵌字排版分支判断：拉丁文字（英译）走横排按词换行，CJK（日/中译）保持竖排
export const usesLatinScript = (text: string): boolean => {
    const stripped = text.replace(/\s+/g, '')
    if (!stripped) return false
    const latinCount = (stripped.match(/[\u0041-\u005A\u0061-\u007A\u00C0-\u024F]/g) || []).length
    return latinCount > stripped.length * 0.5
}

// 按词 greedy 换行；超过一行宽度的长词按字符硬切。measure 由调用方注入（如 canvas measureText）
export const wrapLines = (measure: (text: string) => number, text: string, maxWidth: number) => {
    const lines: string[] = []
    const fits = (candidate: string) => measure(candidate) <= maxWidth
    let current = ''
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (current && !fits(`${current} ${word}`)) {
            lines.push(current)
            current = ''
        }
        let chunk = word
        while (chunk.length > 1 && !fits(chunk)) {
            let cut = 1
            while (cut < chunk.length && fits(chunk.slice(0, cut + 1))) cut++
            lines.push(chunk.slice(0, cut))
            chunk = chunk.slice(cut)
        }
        current = current ? `${current} ${chunk}` : chunk
    }
    if (current) lines.push(current)
    return lines
}
