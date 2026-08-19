// scripts/build.mjs
// Nuxt 官方限制 workaround (nuxt/nuxt#28474): 相对 baseURL 写在 nuxt.config.ts 里会被 Nitro 在 generate 时忽略
// 官方做法是构建时提供 NUXT_APP_BASE_URL 环境变量
// Windows shell 不支持 VAR=x cmd 语法 故用本脚本注入环境变量后再调用 nuxt generate
import { spawn } from 'node:child_process'

process.env.NUXT_APP_BASE_URL = './'

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(command, ['nuxt', 'generate'], {
    stdio: 'inherit',
    env: process.env,
    // Windows 上 spawn .cmd 文件必须经 shell (Node 22 安全限制)
    shell: process.platform === 'win32'
})

child.on('error', (error) => {
    console.error('[build] spawn failed:', error)
    process.exit(1)
})

child.on('exit', (code) => process.exit(code ?? 1))
