<!-- app/components/TokenizedWords.vue -->
<script setup lang="ts">
interface Token {
	word: string
	type?: 'noun' | 'verb' | 'particle' | 'adjective' | 'other'
}

const { tokens } = defineProps<{
	tokens: Token[]
}>()

const handleTokenClick = (word: string, type: string) => {
	console.log('点击单词:', { word, type })
}
</script>

<template>
	<div class="card-manga p-4">
		<div class="text-xs font-semibold mb-3" style="color: var(--text-secondary);">
			🔤 分词结果
		</div>

		<div v-if="tokens.length > 0" class="flex gap-2 flex-wrap">
			<TokenButton v-for="(token, index) in tokens" :key="index" :word="token.word" :type="token.type"
				@click="handleTokenClick" />
		</div>

		<div v-else class="text-sm" style="color: var(--text-secondary);">
			分词结果将显示在这里...
		</div>

		<!-- 图例 -->
		<div class="mt-3 pt-3 border-t flex gap-3 flex-wrap text-xs" style="border-color: var(--border-color);">
			<div class="flex items-center gap-1">
				<div class="w-3 h-3 rounded" style="background-color: var(--color-manga-400);"></div>
				<span style="color: var(--text-secondary);">名词</span>
			</div>
			<div class="flex items-center gap-1">
				<div class="w-3 h-3 rounded" style="background-color: var(--color-accent-primary);"></div>
				<span style="color: var(--text-secondary);">动词</span>
			</div>
			<div class="flex items-center gap-1">
				<div class="w-3 h-3 rounded" style="background-color: var(--color-manga-500);"></div>
				<span style="color: var(--text-secondary);">助词</span>
			</div>
			<div class="flex items-center gap-1">
				<div class="w-3 h-3 rounded" style="background-color: var(--color-accent-success);"></div>
				<span style="color: var(--text-secondary);">形容词</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
/* 组件特定样式 */
</style>
