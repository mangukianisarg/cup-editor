import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadLocalEnv() {
  for (const filePath of [path.join(__dirname, '.env'), path.join(__dirname, '..', '..', '.env')]) {
    if (!existsSync(filePath)) continue
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) continue
      const key = trimmed.slice(0, separatorIndex).trim()
      const rawValue = trimmed.slice(separatorIndex + 1).trim()
      if (!key || process.env[key]) continue
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
    }
  }
}

loadLocalEnv()

const openAiImageModels = [process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2', 'gpt-image-1']

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 32_000_000) {
        reject(new Error('Request body is too large.'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON request body.'))
      }
    })
    req.on('error', reject)
  })
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function buildImageUrls(data) {
  return (data.data || [])
    .map((item) => item?.b64_json)
    .filter(Boolean)
    .map((imageBase64) => `data:image/png;base64,${imageBase64}`)
}

export function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function createOpenAiImage({ prompt, logoImage, count = 3 }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is missing. Add it to your environment before generating artwork.')
    error.status = 500
    throw error
  }

  const imageCount = Math.max(1, Math.min(4, Number(count) || 3))
  let lastError
  for (const model of [...new Set(openAiImageModels)]) {
    try {
      const logoData = parseDataUrl(logoImage?.dataUrl)
      const runRequest = async (requestCount) => {
        const requestOptions = logoData
          ? (() => {
            const formData = new FormData()
            formData.append('model', model)
            formData.append('prompt', prompt)
            formData.append('n', String(requestCount))
            formData.append('size', '1536x1024')
            formData.append('quality', 'high')
            formData.append('output_format', 'png')
            formData.append('image[]', new Blob([logoData.buffer], { type: logoData.mimeType }), logoImage?.name || 'logo.png')
            return {
              method: 'POST',
              headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
              body: formData,
              endpoint: 'https://api.openai.com/v1/images/edits',
            }
          })()
          : {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              prompt,
              n: requestCount,
              size: '1536x1024',
              quality: 'high',
              output_format: 'png',
              moderation: 'auto',
            }),
            endpoint: 'https://api.openai.com/v1/images/generations',
          }

        const response = await fetch(requestOptions.endpoint, requestOptions)
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const error = new Error(data.error?.message || `OpenAI image generation failed with ${response.status}.`)
          error.status = response.status
          throw error
        }
        return buildImageUrls(data)
      }

      const imageUrls = await runRequest(imageCount)
      while (logoData && imageUrls.length < imageCount) {
        const nextImageUrls = await runRequest(1)
        if (!nextImageUrls.length) break
        imageUrls.push(...nextImageUrls)
      }
      if (!imageUrls.length) {
        const error = new Error('OpenAI did not return image data.')
        error.status = 502
        throw error
      }
      return {
        imageUrl: imageUrls[0],
        imageUrls: imageUrls.slice(0, imageCount),
        model,
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function createOpenAiCupPlacements({ designImage, sceneImages = [] }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is missing. Add it to your environment before editing lifestyle images.')
    error.status = 500
    throw error
  }

  const designData = parseDataUrl(designImage?.dataUrl)
  if (!designData) {
    const error = new Error('Design image is required to place the cup into lifestyle images.')
    error.status = 400
    throw error
  }
  const sceneData = sceneImages
    .map((scene, index) => ({
      id: scene.id || `lifestyle-${index + 1}`,
      label: scene.label || `Lifestyle ${index + 1}`,
      name: scene.name || `lifestyle-${index + 1}.png`,
      data: parseDataUrl(scene.dataUrl),
    }))
    .filter((scene) => scene.data)

  if (!sceneData.length) {
    const error = new Error('Upload at least one lifestyle image.')
    error.status = 400
    throw error
  }

  let lastError
  for (const model of [...new Set(openAiImageModels)]) {
    try {
      const scenes = []
      for (const scene of sceneData.slice(0, 3)) {
        const formData = new FormData()
        formData.append('model', model)
        formData.append('prompt', [
          'Edit the provided lifestyle photo by adding one realistic branded paper coffee cup into the scene.',
          'Use the provided flat cup-wrap artwork as the exact design reference for the cup branding.',
          'Preserve the original lifestyle photo composition, people, lighting, mood, and background as much as possible.',
          'Place the cup naturally on a table, in a hand, or another believable spot that matches the existing scene perspective.',
          'The cup must look photographed in the scene, with matching light, shadows, scale, and depth of field.',
          'Do not create a new scene. Do not add unrelated text, fake labels, extra logos, watermarks, UI, or collage frames.',
        ].join('\n'))
        formData.append('n', '1')
        formData.append('size', '1024x1024')
        formData.append('quality', 'high')
        formData.append('output_format', 'png')
        formData.append('image[]', new Blob([designData.buffer], { type: designData.mimeType }), designImage?.name || 'cup-design.png')
        formData.append('image[]', new Blob([scene.data.buffer], { type: scene.data.mimeType }), scene.name)

        const response = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: formData,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const error = new Error(data.error?.message || `OpenAI lifestyle edit failed with ${response.status}.`)
          error.status = response.status
          throw error
        }
        const [imageUrl] = buildImageUrls(data)
        if (imageUrl) scenes.push({ id: scene.id, label: scene.label, imageUrl })
      }
      if (!scenes.length) {
        const error = new Error('OpenAI did not return edited lifestyle images.')
        error.status = 502
        throw error
      }
      return { scenes, model }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export function createOpenAiArtworkHandler() {
  return async function openAiArtworkHandler(req, res, next) {
    const pathname = req.url?.split('?')[0]
    if (req.method !== 'POST' || !['/api/generate-artwork', '/api/place-cup-scenes'].includes(pathname)) {
      next?.()
      return false
    }

    try {
      if (pathname === '/api/place-cup-scenes') {
        const { designImage, sceneImages } = await readJsonBody(req)
        const result = await createOpenAiCupPlacements({ designImage, sceneImages })
        sendJson(res, 200, result)
      } else {
        const { prompt, logoImage, count } = await readJsonBody(req)
        if (!prompt || typeof prompt !== 'string') {
          sendJson(res, 400, { error: 'Prompt is required.' })
          return true
        }
        const result = await createOpenAiImage({ prompt, logoImage, count })
        sendJson(res, 200, result)
      }
    } catch (error) {
      sendJson(res, error.status || 500, { error: error.message || 'Unable to generate artwork.' })
    }
    return true
  }
}
