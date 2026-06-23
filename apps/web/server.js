import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOpenAiArtworkHandler, sendJson } from './openai-artwork-api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const port = Number(process.env.PORT || 5173)
const openAiArtworkHandler = createOpenAiArtworkHandler()

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function getSafeFilePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname)
  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const filePath = path.normalize(path.join(distDir, requestedPath))
  return filePath.startsWith(distDir) ? filePath : path.join(distDir, 'index.html')
}

async function serveFile(req, res) {
  const filePath = getSafeFilePath(req.url)
  try {
    const content = await readFile(filePath)
    const extension = path.extname(filePath)
    res.statusCode = 200
    res.setHeader('Content-Type', contentTypes[extension] || 'application/octet-stream')
    res.end(content)
  } catch {
    try {
      const content = await readFile(path.join(distDir, 'index.html'))
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(content)
    } catch {
      sendJson(res, 404, { error: 'Not found.' })
    }
  }
}

createServer(async (req, res) => {
  if (await openAiArtworkHandler(req, res)) return
  await serveFile(req, res)
}).listen(port, () => {
  console.log(`EcoCarry web server listening on http://0.0.0.0:${port}`)
})
