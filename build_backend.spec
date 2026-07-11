# build_backend.spec
# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all
import torch
import os

datas = []
binaries = []
hiddenimports = []
excludes = [
    'numpy.testing',
    'numpy.tests',
    'numpy.f2py.tests',
    'numpy._pyinstaller',
    'torch.utils.tensorboard',
    'torchaudio',
    'transformers.commands',
    'transformers.onnx',
    'transformers.testing_utils',
]


def filter_collected_artifacts(entries):
    filtered = []
    for entry in entries:
        src = entry[0].replace('\\', '/').lower()
        dest = entry[1].replace('\\', '/').lower()
        if src.endswith('.lib'):
            continue
        if '/tests/' in dest or dest.endswith('/tests'):
            continue
        if '/include/' in dest or dest.endswith('/include'):
            continue
        filtered.append(entry)
    return filtered


def filter_hiddenimports(imports):
    filtered = []
    for name in imports:
        if name.startswith(('numpy.tests', 'numpy.testing', 'numpy.f2py.tests')):
            continue
        if name.startswith('numpy._pyinstaller'):
            continue
        if '.tests' in name or name.endswith('.tests'):
            continue
        if name.endswith(('_tests', '.conftest', '.setup')):
            continue
        filtered.append(name)
    return filtered

# 手动处理 torch 依赖 (避免 collect_all 卡死，同时解决 DLL 缺失)
torch_root = os.path.dirname(torch.__file__)
torch_lib = os.path.join(torch_root, 'lib')

# 1. 收集 torch/lib 下的所有 DLL
if os.path.exists(torch_lib):
    for file in os.listdir(torch_lib):
        if file.endswith('.dll'):
            # 保持 PyTorch 标准目录结构，避免同一 DLL 被复制到三个位置。
            binaries.append((os.path.join(torch_lib, file), 'torch/lib'))

# 2. 额外检查 torch 根目录下的 DLL (如 libiomp5md.dll 可能在根目录)
for file in os.listdir(torch_root):
    if file.endswith('.dll'):
        binaries.append((os.path.join(torch_root, file), 'torch'))

# 3. 确保 torch 被导入
hiddenimports.append('torch')

# 4. 强制包含 libiomp5md.dll (OpenMP 库，c10.dll 的关键依赖)
# 优先使用 torch 自带的，因为它与 torch 兼容性最好
libiomp_path = os.path.join(torch_lib, 'libiomp5md.dll')
if not os.path.exists(libiomp_path):
    # 如果 torch 里没有，再遍历 site-packages 查找
    import site
    site_packages = site.getsitepackages()[0]
    for root, dirs, files in os.walk(site_packages):
        if 'libiomp5md.dll' in files:
            libiomp_path = os.path.join(root, 'libiomp5md.dll')
            break

if libiomp_path and os.path.exists(libiomp_path):
    print(f"Found libiomp5md.dll at: {libiomp_path}")
    binaries.append((libiomp_path, '.'))
else:
    print("WARNING: libiomp5md.dll not found in site-packages!")

# 收集所有必要的库 (防止漏掉)
tmp_ret = collect_all('sudachipy')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

tmp_ret = collect_all('sudachidict_core')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

tmp_ret = collect_all('manga_ocr')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# 修复 protobuf 缺失问题
tmp_ret = collect_all('google.protobuf')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
hiddenimports += ['google.protobuf']

# 修复 sentencepiece 缺失问题 (防止下一个报错)
tmp_ret = collect_all('sentencepiece')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
hiddenimports += ['sentencepiece']

# 关键修复：收集 tokenizers 库
tmp_ret = collect_all('tokenizers')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
hiddenimports += ['tokenizers']

# 关键修复：收集 fugashi 和 unidic_lite (BertJapaneseTokenizer 必须)
tmp_ret = collect_all('fugashi')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
hiddenimports += ['fugashi']

tmp_ret = collect_all('unidic_lite')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
hiddenimports += ['unidic_lite']

tmp_ret = collect_all('transformers')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]

# 移除 collect_all('torch') 以避免构建卡死
# PyInstaller 通常能自动处理 torch，如果遇到 DLL 错误，我们再单独处理
hiddenimports += ['torch']

# 针对 llama_cpp 的处理
tmp_ret = collect_all('llama_cpp')
datas += filter_collected_artifacts(tmp_ret[0]); binaries += filter_collected_artifacts(tmp_ret[1]); hiddenimports += tmp_ret[2]

# [CRITICAL FIX] 遍历 site-packages/llama_cpp/lib 下的所有 DLL
# 将它们强制复制到打包后的根目录 '.'，确保 backend_service.py 能在最外层找到它们
import site
site_packages = site.getsitepackages()[0]
llama_lib_src = os.path.join(site_packages, 'llama_cpp', 'lib')

if os.path.exists(llama_lib_src):
    for file in os.listdir(llama_lib_src):
        if file.endswith('.dll'):
            print(f"Force collecting DLL to root: {file}")
            binaries.append((os.path.join(llama_lib_src, file), '.')) # 复制到根目录
            binaries.append((os.path.join(llama_lib_src, file), 'llama_cpp/lib')) # 同时也保持原始结构

# [NEW] Copy all llama_cpp DLLs to root to ensure they are found
import site
site_packages = site.getsitepackages()[0]
llama_lib = os.path.join(site_packages, 'llama_cpp', 'lib')
if os.path.exists(llama_lib):
    for file in os.listdir(llama_lib):
        if file.endswith('.dll'):
            binaries.append((os.path.join(llama_lib, file), '.'))
            print(f"Copying {file} from llama_cpp/lib to root")


# [CRITICAL FIX] Manually copy llama.dll to root and _internal to ensure visibility
import glob
llama_dll_path = None
# Search in venv
possible_paths = [
    'services/venv/Lib/site-packages/llama_cpp/lib/llama.dll',
    '../services/venv/Lib/site-packages/llama_cpp/lib/llama.dll',
]
for p in possible_paths:
    if os.path.exists(p):
        llama_dll_path = os.path.abspath(p)
        break

if llama_dll_path:
    print(f"Found llama.dll at: {llama_dll_path}")
    # Copy to root (for direct loading)
    binaries.append((llama_dll_path, '.'))
    # Copy to _internal (standard place)
    # binaries.append((llama_dll_path, '_internal'))
    # Copy to llama_cpp/lib (where python module expects it)
    # binaries.append((llama_dll_path, 'llama_cpp/lib'))
else:
    print("WARNING: llama.dll not found in expected paths!")

# 修复 numpy 缺失问题
tmp_ret = collect_all('numpy')
datas += filter_collected_artifacts(tmp_ret[0]); binaries += filter_collected_artifacts(tmp_ret[1]); hiddenimports += filter_hiddenimports(tmp_ret[2])
hiddenimports += ['numpy']


block_cipher = None

a = Analysis(
    ['services/backend_service.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='backend',
)
