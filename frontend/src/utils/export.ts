import JSZip from 'jszip'

interface StoryboardShot {
  序号: number
  标题: string
  描述: string
  时长: string
}

function getDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function exportScriptMarkdown(scriptContent: string) {
  const filename = `剧本_${getDateString()}.md`
  downloadFile(scriptContent, filename, 'text/markdown;charset=utf-8')
}

export function exportScriptTxt(scriptContent: string) {
  const filename = `剧本_${getDateString()}.txt`
  downloadFile(scriptContent, filename, 'text/plain;charset=utf-8')
}

export function parseStoryboard(storyboardContent: string): StoryboardShot[] {
  const shots: StoryboardShot[] = []

  const cnToNum: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 }
  const shotRegex = /^\*\*镜([一二三四五六七八九十\d]+)\s*[·\-]?\s*([^（]*)\s*（([^）]*)）\*\*/gm
  const blocks: { match: RegExpExecArray; bodyStart: number }[] = []

  let match: RegExpExecArray | null
  while ((match = shotRegex.exec(storyboardContent)) !== null) {
    blocks.push({ match, bodyStart: match.index + match[0].length })
  }

  for (let i = 0; i < blocks.length; i++) {
    const { match: m, bodyStart } = blocks[i]
    const cnNum = m[1]
    const title = m[2].trim() || `镜头${i + 1}`
    const timeRange = m[3].trim()
    const bodyEnd = i + 1 < blocks.length ? blocks[i + 1].match.index : storyboardContent.length
    const body = storyboardContent.slice(bodyStart, bodyEnd).trim()
    const shotIndex = cnToNum[cnNum] ?? parseInt(cnNum, 10) ?? i + 1

    shots.push({
      序号: shotIndex,
      标题: title,
      描述: body.slice(0, 200),
      时长: timeRange,
    })
  }

  return shots
}

export function exportStoryboardJson(storyboardContent: string) {
  const shots = parseStoryboard(storyboardContent)

  let output: string
  if (shots.length > 0) {
    output = JSON.stringify(shots, null, 2)
  } else {
    output = JSON.stringify({ raw: storyboardContent }, null, 2)
  }

  const filename = `分镜_${getDateString()}.json`
  downloadFile(output, filename, 'application/json;charset=utf-8')
}

export function exportStoryboardCsv(storyboardContent: string) {
  const shots = parseStoryboard(storyboardContent)
  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  let csv: string
  if (shots.length > 0) {
    const header = '序号,标题,描述,时长'
    const rows = shots.map((s) => `${s.序号},${escapeCsv(s.标题)},${escapeCsv(s.描述)},${escapeCsv(s.时长)}`)
    csv = [header, ...rows].join('\n')
  } else {
    csv = '序号,标题,描述,时长\n'
  }

  const filename = `分镜_${getDateString()}.csv`
  downloadFile(csv, filename, 'text/csv;charset=utf-8')
}

export async function exportAll(scriptContent: string, storyboardContent: string) {
  const zip = new JSZip()
  const date = getDateString()

  zip.file(`剧本_${date}.md`, scriptContent)

  if (storyboardContent) {
    const shots = parseStoryboard(storyboardContent)
    if (shots.length > 0) {
      zip.file(`分镜_${date}.json`, JSON.stringify(shots, null, 2))

      const escapeCsv = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`
        }
        return val
      }
      const header = '序号,标题,描述,时长'
      const rows = shots.map((s) => `${s.序号},${escapeCsv(s.标题)},${escapeCsv(s.描述)},${escapeCsv(s.时长)}`)
      const csv = [header, ...rows].join('\n')
      zip.file(`分镜_${date}.csv`, csv)
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `项目_${date}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
