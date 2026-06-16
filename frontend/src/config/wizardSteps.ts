import { DEFAULTS } from './defaults'

export interface WizardOption {
  id: string
  label: string
  description: string
  icon?: string
}

export interface Question {
  id: string
  text: string
  options: WizardOption[]
}

export interface Question {
  id: string
  text: string
  options: WizardOption[]
}

export interface Question {
  id: string
  text: string
  options: WizardOption[]
}

export interface ModificationCategory {
  id: string
  label: string
  icon: string
  subOptions: string[]
}

export const WIZARD_STEP_IDS = [
  'videoType',
  'materials',
  'storyCore',
  'protagonist',
  'duration',
  'visualStyle',
  'dialogueType',
  'reference',
] as const

export type WizardStepId = typeof WIZARD_STEP_IDS[number]

export const WIZARD_STEP_QUESTIONS: Record<WizardStepId, string> = {
  videoType: '你想做哪种{topic}视频？',
  materials: '你有现成的素材吗？',
  storyCore: '这个故事的核心是什么？',
  protagonist: '主角设定是怎样的？',
  duration: '时长目标是多少？',
  visualStyle: '希望是哪种视觉风格？',
  dialogueType: '对白类型是怎样的？',
  reference: '有没有特殊参考作品？',
}

export const DURATION_MAP: Record<string, number> = {
  under_1min: 45,
  '1_2min': 90,
  '2_3min': 150,
  short: 45,
  medium: 90,
  long: 150,
}

export const MODIFICATION_CATEGORIES: ModificationCategory[] = [
  {
    id: 'character',
    label: '角色设定',
    icon: '👤',
    subOptions: ['修改名字', '调整性格', '改变背景故事', '修改外貌特色'],
  },
  {
    id: 'dialogue',
    label: '对白内容',
    icon: '💬',
    subOptions: ['修改某句台词', '调整语气风格', '删减对话', '增加对话'],
  },
  {
    id: 'scene',
    label: '场景设置',
    icon: '🏞️',
    subOptions: ['修改地点', '调整氛围', '改变视觉感'],
  },
  {
    id: 'plot',
    label: '情节走向',
    icon: '📖',
    subOptions: ['增加场景', '删减场景', '改变故事方向'],
  },
  {
    id: 'pacing',
    label: '节奏/结局',
    icon: '🎭',
    subOptions: ['加快节奏', '放慢节奏', '悲情结局', '开放结局', '加入反转'],
  },
]

export const VOICE_OPTIONS: WizardOption[] = [
  { id: 'tts', label: '用旁白模型生成音色', description: '使用AI语音合成生成旁白', icon: '🎙️' },
  { id: 'extract', label: '用视频提取音色', description: '从参考视频中提取语音风格', icon: '📹' },
  { id: 'skip', label: '跳过语音继续生成', description: '先不处理语音，后续再添加', icon: '⏭️' },
]

export const API_PROVIDERS = [
  { id: 'mimo', label: 'MiMo', baseUrl: DEFAULTS.CHAT_BASE_URL, model: DEFAULTS.CHAT_MODEL },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { id: 'custom', label: '自定义兼容API', baseUrl: '', model: '' },
] as const

// ===== Art Style Skills =====

export interface SkillStyle {
  id: string
  name: string
  description: string
  system_prompt: string
}

export const STYLE_SKILLS: SkillStyle[] = [
  { id: 'style_cinematic', name: '电影感', description: '氛围感强、镜头感强', system_prompt: 'cinematic, film still, dramatic lighting, moody atmosphere, shallow depth of field' },
  { id: 'style_realistic', name: '写实风', description: '真实自然、细节丰富', system_prompt: 'realistic, photorealistic, natural lighting, lifelike details, highly detailed' },
  { id: 'style_anime', name: '动漫风', description: '二次元感、角色鲜明', system_prompt: 'anime style, manga style, expressive eyes, cel shading, clean line art' },
  { id: 'style_watercolor', name: '水彩风', description: '柔和梦幻、文艺治愈', system_prompt: 'watercolor, soft brush strokes, pastel tones, dreamy texture, hand-painted look' },
  { id: 'style_3d', name: '3D渲染风', description: '立体感强、视觉冲击', system_prompt: '3D render, CGI, detailed modeling, volumetric lighting, smooth texture' },
  { id: 'style_3d_guoman', name: '3D国漫风', description: '超写实影视级CG，次世代古风玄幻3D人像', system_prompt: 'ultra-realistic CG, next-gen fantasy 3D portrait, photo-realistic rendering, 8K detail, subsurface scattering skin, individual hair strands, translucent fabric, delicate metal jewelry, soft studio lighting, low contrast soft shadows, Eastern xianxia fantasy realism' },
  { id: 'style_vintage', name: '复古风', description: '怀旧、经典、胶片感', system_prompt: 'vintage, retro style, old film texture, faded color, nostalgic tone' },
  { id: 'style_futuristic', name: '未来科技风', description: '科技感、赛博感', system_prompt: 'futuristic, sci-fi style, cyberpunk, neon lighting, holographic interface' },
  { id: 'style_minimalist', name: '极简风', description: '干净高级、留白感', system_prompt: 'minimalist, clean composition, elegant design, soft color palette, refined visual' },
  { id: 'style_dreamy', name: '梦幻童话风', description: '唯美浪漫、奇幻发光', system_prompt: 'dreamy fantasy, magical atmosphere, ethereal light, glowing particles, fairy tale style' },
  { id: 'style_shinkai', name: '新海诚风格', description: '唯美清新、光影细腻', system_prompt: 'Makoto Shinkai style, vivid sky, detailed clouds, atmospheric lighting, anime aesthetic' },
  { id: 'style_cyberpunk', name: '赛博朋克风格', description: '霓虹灯、高对比', system_prompt: 'Cyberpunk-style, neon lighting, holographic flowers, dark atmosphere, high contrast' },
  { id: 'style_vangogh', name: '梵高风格', description: '后印象派、抽象笔触', system_prompt: "style in Van Gogh's The starry night, Post-impressionism, abstract painting, Orange and blue, flowing moon and stars background, illustration" },
]

const STYLE_STORAGE_KEY = 'selected_style_skill'

export function getSelectedStyle(): SkillStyle | null {
  try {
    const raw = localStorage.getItem(STYLE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function setSelectedStyle(style: SkillStyle | null) {
  if (style) {
    localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(style))
  } else {
    localStorage.removeItem(STYLE_STORAGE_KEY)
  }
}

export function getStylePromptPrefix(): string {
  const style = getSelectedStyle()
  if (!style) return ''
  return `${style.system_prompt}, `
}
