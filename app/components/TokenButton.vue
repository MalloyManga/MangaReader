<!-- app/components/TokenButton.vue -->
<script setup lang="ts">
type TokenType = 'noun' | 'verb' | 'particle' | 'adjective' | 'other'
interface Prop {
    word: string
    reading?: string
    type?: TokenType
}

const { word, type = 'other' } = defineProps<Prop>()
const { showToast } = useToast()

const getTokenClasses = (tokenType: TokenType) => {
    switch (tokenType) {
        case 'noun':
            return 'bg-manga-400 text-white'
        case 'verb':
            return 'bg-primary text-white'
        case 'particle':
            return 'bg-manga-500 text-white'
        case 'adjective':
            return 'bg-secondary text-white'
        default:
            return 'bg-manga-400 text-white'
    }
}

const handleClick = () => {
    navigator.clipboard.writeText(word)
    showToast('已复制 📋')
}
</script>

<template>
    <button
        class="group relative px-2 pt-2 rounded transition-all hover:scale-105 cursor-pointer active:translate-y-0.5"
        :class="getTokenClasses(type)" @click="handleClick">
        <!-- 使用 ruby 标签实现振假名 -->
        <ruby class="font-ja text-sm font-medium">
            {{ word }}
            <rt v-if="reading"
                class="text-[0.6rem] text-white/90 font-normal select-none opacity-80 group-hover:opacity-100">
                {{ reading }}
            </rt>
        </ruby>
    </button>
</template>

<style scoped>
/* 
  微调 ruby 对齐 
  有些浏览器 rt 默认字体可能偏小或偏大
*/
rt {
    font-family: sans-serif;
    /* 读音通常用无衬线字体更清晰 */
    text-align: center;
}
</style>
