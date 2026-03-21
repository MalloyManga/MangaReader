<!-- ToolTip.vue -->
<script setup lang="ts">
interface Props {
    text: string
}
defineProps<Props>()
</script>

<template>
    <div class="bg-black/80 text-white px-5 py-3 rounded-lg text-sm 
        backdrop-blur-sm shadow-lg pointer-events-none select-none
        w-max max-w-sm text-center">
        {{ text }}
    </div>
</template>
