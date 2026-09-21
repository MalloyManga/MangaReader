const fs = require('fs')
const cp = require('child_process')

const GROUPS = ['common', 'library', 'reader', 'readerWorkflow', 'bubbleList', 'fileWorkflow', 'loader',
  'settings', 'general', 'translationManagement', 'detectionManagement', 'autoTranslate',
  'autoTranslateWorkflow', 'messages', 'about'].join('|')

// 任何引号内的点号路径都算"被引用" 覆盖 t('a.b') / 三元 / 变量 key / nameKey: 'a.b'
const keyRe = new RegExp("['`\"](?:(" + GROUPS + ")(?:\\.[A-Za-z0-9_]+)+)['`\"]", 'g')

const files = cp.execSync('git ls-files app').toString().trim().split('\n')
  .filter(f => /\.(vue|ts)$/.test(f) && !/locales\//.test(f))

const used = new Set()
const dynamicSpots = []
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  for (const m of s.matchAll(keyRe)) {
    // 跳过 HTML 属性值 (="settings.enableTokenization" 这类是对象属性访问 不是 i18n key) 
    if (s[m.index - 1] === '=') continue
    used.add(m[0].slice(1, -1))
  }
  // t( 后面不是字符串字面量的地方 = 需要人工确认的动态 key
  for (const m of s.matchAll(/(?<![\w$])t\(\s*(?!['"`])([^)]{0,60})/g)) dynamicSpots.push(f + ': t(' + m[1].trim())
}

const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' ? flat(v, p + k + '.') : [p + k])
const locales = {}
for (const f of ['app/locales/en.json', 'app/locales/zh.json']) locales[f] = flat(JSON.parse(fs.readFileSync(f, 'utf8')))

const en = locales['app/locales/en.json'], zh = locales['app/locales/zh.json']
const dup = a => [...new Set(a.filter((k, i) => a.indexOf(k) !== i))]

console.log('en keys', en.length, '| zh keys', zh.length)
console.log('in-file duplicates: en', dup(en), 'zh', dup(zh))
console.log('set diff:', zh.filter(k => !en.includes(k)).concat(en.filter(k => !zh.includes(k))))
console.log('referenced-but-missing:', [...used].filter(k => !en.includes(k)))
const unused = en.filter(k => !used.has(k))
console.log('unused count:', unused.length)
console.log(unused.join('\n'))
console.log('--- dynamic t() call sites (manual review) ---')
console.log([...new Set(dynamicSpots)].join('\n'))

// 硬编码文案检测：剥掉注释与 console 日志后，任何残留的中日韩文都应走 i18n
const stripNonCode = source => source
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/console\.\w+\((?:[^()\n]|\([^()]*\))*\)/g, '')

const hardcoded = []
for (const f of files) {
  const lines = stripNonCode(fs.readFileSync(f, 'utf8')).split(/\r?\n/)
  lines.forEach((line, i) => {
    if (/[一-鿿]/.test(line)) hardcoded.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`)
  })
}
console.log('\n--- hardcoded CJK text outside comments/logs ---')
console.log(hardcoded.length ? hardcoded.join('\n') : 'none')
