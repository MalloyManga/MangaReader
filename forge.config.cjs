const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    icon: './public/MangaReaderLogo',
    asar: true,
    // 1. 将打包好的 Python 后端作为额外资源复制到 resources 目录
    // 注意: PyInstaller 生成的是 backend 文件夹 (onedir 模式) 所以这里必须复制整个文件夹
    extraResource: [
      './dist/backend',
    ],
    // 2. 忽略不需要打包的文件 (减小体积)
    ignore: [
      /^\/services/,
      /^\/README\.md$/,
      /^\/public\/MangaReader_Header\.png$/,
      /^\/\.gitignore$/,
      /^\/forge\.config\.js$/,
      /^\/tsconfig\.json$/,
      /^\/nuxt\.config\.ts$/,
      // 优化忽略规则: 兼容 Windows 反斜杠 确保 models 文件夹被正确忽略
      /[\\/]models[\\/]/,
      /[\\/]models$/,
      /[\\/]dist[\\/]/,
      /[\\/]dist$/,
      /[\\/]out[\\/]/,
      /[\\/]out$/,
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
