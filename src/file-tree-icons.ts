/**
 * 文件类型图标。
 *
 * 「文件管理」那棵树用共享的文件类型图标，文件一眼能看出是什么类型；我们原来
 * 所有文件都画同一个轮廓图标，一排代码和图片长得一样。
 *
 * 这里按扩展名分几类，各配一个简笔图标：够用、且不引宿主包（宿主那套图标是
 * React 组件，只能在它的插槽里用，我们自己的树用不上）。
 */

/** 一类文件的图标。 */
export type FileIconKind =
  | 'code'
  | 'markup'
  | 'style'
  | 'data'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'text'
  | 'binary'

/** 扩展名 → 图标类别。 */
const BY_EXTENSION: Readonly<Record<string, FileIconKind>> = {
  ts: 'code', tsx: 'code', js: 'code', jsx: 'code', mjs: 'code', cjs: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code', java: 'code', kt: 'code',
  c: 'code', h: 'code', cpp: 'code', cc: 'code', hpp: 'code', cs: 'code',
  php: 'code', swift: 'code', sh: 'code', bash: 'code', zsh: 'code', lua: 'code',
  sql: 'code', vue: 'code', svelte: 'code', dart: 'code', scala: 'code',

  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', md: 'markup',
  markdown: 'markup', mdx: 'markup', rst: 'markup',

  css: 'style', scss: 'style', sass: 'style', less: 'style', styl: 'style',

  json: 'data', jsonc: 'data', yaml: 'data', yml: 'data', toml: 'data',
  ini: 'data', csv: 'data', xml_: 'data', lock: 'data',

  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  bmp: 'image', ico: 'image', avif: 'image', heic: 'image',

  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio', aac: 'audio',

  mp4: 'video', mov: 'video', mkv: 'video', avi: 'video', webm: 'video', m4v: 'video',

  zip: 'archive', tar: 'archive', gz: 'archive', tgz: 'archive', bz2: 'archive',
  xz: 'archive', zst: 'archive', rar: 'archive', '7z': 'archive',

  txt: 'text', log: 'text', pdf: 'text', doc: 'text', docx: 'text',

  exe: 'binary', dll: 'binary', so: 'binary', dylib: 'binary', bin: 'binary',
  wasm: 'binary', o: 'binary', a: 'binary', class: 'binary', node: 'binary',
}

/** 没有扩展名的常见文件（Dockerfile、Makefile…）。 */
const BY_NAME: Readonly<Record<string, FileIconKind>> = {
  dockerfile: 'text', makefile: 'text', license: 'text', readme: 'text',
  '.gitignore': 'text', '.env': 'data', '.npmrc': 'data', '.editorconfig': 'data',
  'package.json': 'data', 'tsconfig.json': 'data',
}

/**
 * 按文件名判断文件类别。
 *
 * @param name - 文件名（不含目录）。
 * @returns 图标类别；认不出来时按 text 画（跟普通文档一个图标）。
 */
export function fileIconKind(name: string): FileIconKind {
  const lower = name.toLowerCase()
  const byName = BY_NAME[lower]
  if (byName !== undefined) return byName
  const dot = lower.lastIndexOf('.')
  if (dot <= 0) return 'text'
  const extension = lower.slice(dot + 1)
  return BY_EXTENSION[extension] ?? 'text'
}

/** 各类图标的路径数据（16×16 视口，stroke 跟随文字颜色）。 */
const ICON_PATHS: Readonly<Record<FileIconKind, string>> = {
  code: 'M5.5 5.5 2.5 8l3 2.5M10.5 5.5 13.5 8l-3 2.5M9.4 3.5 6.6 12.5',
  markup: 'M4 2.5h8l1.5 1.5v9.5h-9.5zM6 6.5h5M6 9h5M6 11.5h3',
  style: 'M4 2.5h8l1.5 1.5v9.5h-9.5zM6.5 6.5h4M6.5 9h4M6.5 11.5h2',
  data: 'M3.5 3.5h9v9h-9zM6 3.5v9M9 3.5v9M3.5 6.5h9M3.5 9h9',
  image: 'M2.5 3.5h11v9h-11zM2.5 10l3-3 2.5 2.5 2-2 3.5 3.5M10 6.2a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4z',
  audio: 'M6 12V4l6-1v8M6 12a1.6 1.6 0 1 1-3.2 0A1.6 1.6 0 0 1 6 12zM12 11a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0z',
  video: 'M2.5 4.5h11v7h-11zM9.5 8l4-2v4z',
  archive: 'M2.5 4.5h11v2h-11zM3.5 6.5v7h9v-7M6.5 9h3',
  text: 'M4 2.5h8l1.5 1.5v9.5h-9.5zM6 6h5M6 8.5h5M6 11h5',
  binary: 'M4 2.5h8l1.5 1.5v9.5h-9.5zM6.5 6h3M6.5 8h3M6.5 10h3M6.5 6v4',
}

/**
 * 取某类文件的图标路径。
 *
 * @param kind - 图标类别。
 * @returns SVG path 的 d 属性。
 */
export function fileIconPath(kind: FileIconKind): string {
  return ICON_PATHS[kind]
}
