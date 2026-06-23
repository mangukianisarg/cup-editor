import { Camera, Coffee, Download, Hand, ImageUp, Pause, Play, RotateCcw, Square, Trash2, Utensils } from 'lucide-react'
import React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import cafeSceneUrl from '../assets/scene-cafe.png'
import handSceneUrl from '../assets/scene-hand.png'
import lifestyleBaristaPourUrl from '../assets/lifestyle-barista-pour.png'
import lifestyleCafeTableUrl from '../assets/lifestyle-cafe-table.png'
import lifestyleDateUrl from '../assets/lifestyle-date.png'
import restaurantSceneUrl from '../assets/scene-restaurant.png'
import { Button } from './ui/button'
import { Input } from './ui/input'

const scenarios = {
  none: {
    label: 'Studio',
    icon: Square,
    background: '#f4efe6',
    floor: '#c9965e',
    backdrop: '#f3eadc',
    accent: '#0f766e',
    camera: [0, 1.06, 5.05],
    fog: 0.028,
    key: '#fff7ed',
    fill: '#e0f2fe',
    rim: '#facc15',
  },
  cafe: {
    label: 'Cafe',
    icon: Coffee,
    background: '#f7f3ea',
    floor: '#c9965e',
    backdrop: '#f3eadc',
    accent: '#0f766e',
    camera: [0, 1.06, 5.05],
    fog: 0.028,
    key: '#fff7ed',
    fill: '#e0f2fe',
    rim: '#facc15',
  },
  restro: {
    label: 'Restaurant',
    icon: Utensils,
    background: '#11151d',
    floor: '#34251f',
    backdrop: '#17120f',
    accent: '#c8a96a',
    camera: [0, 1.06, 5.05],
    fog: 0.045,
    key: '#ffe7c2',
    fill: '#64748b',
    rim: '#f59e0b',
  },
  hand: {
    label: 'Customer hand',
    icon: Hand,
    background: '#edf4f1',
    floor: '#d8b897',
    backdrop: '#e6f0ec',
    accent: '#0f766e',
    camera: [0, 1.06, 5.05],
    fog: 0.024,
    key: '#ffffff',
    fill: '#dbeafe',
    rim: '#99f6e4',
  },
}

const TEXTURE_WIDTH = 4096
const TEXTURE_HEIGHT = 2048
const imageCache = new Map()
const sceneImageUrls = {
  cafe: cafeSceneUrl,
  restro: restaurantSceneUrl,
  hand: handSceneUrl,
}
const sceneViewDefaults = {
  none: { zoom: 7.2, cameraHeight: 1.2, cameraX: 0, cameraFov: 38, cameraTargetY: 0 },
  cafe:  { zoom: 6.2, cameraHeight: 1.04, cameraX: 0, cameraFov: 35, cameraTargetY: -0.18 },
  restro: { zoom: 6.2, cameraHeight: 1.04, cameraX: 0, cameraFov: 35, cameraTargetY: -0.18 },
  hand: { zoom: 4.85, cameraHeight: 1, cameraX: 0.1, cameraFov: 35, cameraTargetY: -0.18 },
}
const sceneModelPlacement = {
  none: { position: [0, 0, 0], rotation: [0, -0.08, 0], scale: 1 },
  cafe:{ position: [0, -0.8, 0], rotation: [0, 0.08, 0], scale: 0.54 },
  restro: { position: [0, -0.8, 0], rotation: [0, 0.08, 0], scale: 0.54 },
  hand: { position: [-0.1, -0.68, 0], rotation: [0, -0.04, 0], scale: 0.66 },
}
const CUP_MODEL_WIDTH_SCALE = 0.82
const DEFAULT_ARTWORK_PROMPT = 'premium coffee cup wrap with botanical line art, warm minimal packaging pattern, clean logo-safe center area'
const hardcodedLifestyleImages = [
  { id: 'cafe-table', label: 'Cafe table', name: 'lifestyle-cafe-table.png', url: lifestyleCafeTableUrl },
  { id: 'date-night', label: 'Date night', name: 'lifestyle-date.png', url: lifestyleDateUrl },
  { id: 'barista-pour', label: 'Barista pour', name: 'lifestyle-barista-pour.png', url: lifestyleBaristaPourUrl },
]
const GENERATION_STEPS = [
  'Reading your prompt',
  'Studying the logo',
  'Composing cup artwork',
  'Rendering 3 design options',
  'Applying the first design',
  'Placing cup in your photos',
]

const cupSizes = {
  '8oz': { label: '8 oz', top: 80, bottom: 56, height: 92, wrapWidth: 245, wrapHeight: 92 },
  '12oz': { label: '12 oz', top: 90, bottom: 58, height: 112, wrapWidth: 275, wrapHeight: 112 },
  '16oz': { label: '16 oz', top: 90, bottom: 60, height: 135, wrapWidth: 292, wrapHeight: 135 },
}

function fileToUrl(file) {
  return file ? URL.createObjectURL(file) : ''
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('')
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read logo file.'))
    reader.readAsDataURL(file)
  })
}

async function urlToDataUrl(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  return fileToDataUrl(blob)
}

function colorDistance(a, b) {
  return Math.sqrt(
    ((a[0] - b[0]) ** 2)
    + ((a[1] - b[1]) ** 2)
    + ((a[2] - b[2]) ** 2),
  )
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null)
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

async function getCachedImage(src) {
  if (!src) return null
  if (!imageCache.has(src)) {
    imageCache.set(src, loadImage(src).catch((error) => {
      imageCache.delete(src)
      throw error
    }))
  }
  return imageCache.get(src)
}

async function getDrawableImage(src) {
  try {
    return await getCachedImage(src)
  } catch {
    return null
  }
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height
  const frameRatio = width / height
  const drawWidth = imageRatio > frameRatio ? height * imageRatio : width
  const drawHeight = imageRatio > frameRatio ? height : width / imageRatio
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function drawFittedText(ctx, text, maxWidth, y, color) {
  const safeText = text.trim()
  if (!safeText) return
  let fontSize = 156
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `900 ${fontSize}px Inter, Arial, sans-serif`
  while (ctx.measureText(safeText).width > maxWidth && fontSize > 72) {
    fontSize -= 6
    ctx.font = `900 ${fontSize}px Inter, Arial, sans-serif`
  }
  ctx.fillText(safeText, 0, y)
}

function buildProductionArtworkPrompt(rawPrompt, hasLogo = false) {
  const idea = rawPrompt.trim() || DEFAULT_ARTWORK_PROMPT
  return [
    'Create one production-ready printable paper cup wrap artwork.',
    `Creative direction: ${idea}.`,
    'Output must be a flat horizontal rectangular 2D packaging design, full-bleed edge-to-edge, suitable for wrapping around a disposable coffee cup.',
    'Use premium brand-quality composition, crisp vector-like shapes, refined color harmony, clean negative space, and a polished modern packaging look.',
    hasLogo
      ? 'Use the provided logo image as the brand mark. Place it once in a clean, balanced central logo area and harmonize the design colors around it. Preserve the logo shape and legibility.'
      : 'Keep the artwork seamless across the left and right edges. Reserve a soft clean central area where a logo may be placed later, but do not draw a logo.',
    'Do not include extra words, letters, numbers, barcodes, watermarks, dielines, crop marks, UI, photographs, cup mockups, hands, tables, shadows, perspective, or background scene.',
    'The result should look like final print artwork, not a product render.',
  ].join('\n')
}

async function removeLogoBackground(file) {
  const sourceUrl = fileToUrl(file)
  try {
    const image = await loadImage(sourceUrl)
    if (!image) return ''
    const maxSize = 1600
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return sourceUrl
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = frame.data
    const sample = Math.max(3, Math.min(24, Math.floor(Math.min(canvas.width, canvas.height) * 0.05)))
    const corners = [
      [0, 0],
      [canvas.width - sample, 0],
      [0, canvas.height - sample],
      [canvas.width - sample, canvas.height - sample],
    ]
    const background = [0, 0, 0]
    let count = 0

    corners.forEach(([startX, startY]) => {
      for (let y = startY; y < startY + sample; y += 1) {
        for (let x = startX; x < startX + sample; x += 1) {
          const index = (y * canvas.width + x) * 4
          if (data[index + 3] < 20) continue
          background[0] += data[index]
          background[1] += data[index + 1]
          background[2] += data[index + 2]
          count += 1
        }
      }
    })

    if (!count) return canvas.toDataURL('image/png')
    background[0] /= count
    background[1] /= count
    background[2] /= count

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3]
      if (alpha < 20) continue
      const color = [data[index], data[index + 1], data[index + 2]]
      const distance = colorDistance(color, background)
      const isNearWhite = color[0] > 242 && color[1] > 242 && color[2] > 242
      const isBackground = distance < 34 || isNearWhite
      const isSoftEdge = distance >= 34 && distance < 74
      if (isBackground) {
        data[index + 3] = 0
      } else if (isSoftEdge) {
        data[index + 3] = Math.round(alpha * ((distance - 34) / 40))
      }
    }

    ctx.putImageData(frame, 0, 0)
    return canvas.toDataURL('image/png')
  } finally {
    if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl)
  }
}

function getCupPose(scenario) {
  return sceneModelPlacement[scenario] || sceneModelPlacement.none
}

function enableShadows(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

function createMat(color, roughness = 0.6, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function addBox(group, size, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.rotation.set(rotation[0], rotation[1], rotation[2])
  group.add(mesh)
  return mesh
}

function addCylinder(group, radiusTop, radiusBottom, height, position, material, radialSegments = 64, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.rotation.set(rotation[0], rotation[1], rotation[2])
  group.add(mesh)
  return mesh
}

function addCapsule(group, radius, length, position, material, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 12, 28), material)
  mesh.position.set(position[0], position[1], position[2])
  mesh.rotation.set(rotation[0], rotation[1], rotation[2])
  group.add(mesh)
  return mesh
}

function createCafeSceneProps() {
  const group = new THREE.Group()
  const wood = createMat('#8b5e34', 0.5)
  const darkMetal = createMat('#20242c', 0.32, 0.2)
  const steel = createMat('#cbd5df', 0.24, 0.45)
  const black = createMat('#05070a', 0.4, 0.18)
  const warmLight = new THREE.MeshBasicMaterial({ color: '#fef3c7' })

  addBox(group, [8.8, 0.28, 3.4], [0, -1.47, -0.2], wood)
  addBox(group, [8.8, 0.16, 0.18], [0, -1.23, 1.42], createMat('#6f4424', 0.52))
  addBox(group, [1.38, 1.08, 0.72], [-2.2, -0.64, -0.82], darkMetal)
  addBox(group, [1.15, 0.55, 0.16], [-2.2, -0.34, -0.43], steel)
  addBox(group, [0.72, 0.36, 0.08], [-2.2, -0.35, -0.33], black)
  addCylinder(group, 0.16, 0.16, 0.42, [-2.58, 0.05, -0.73], steel, 48)
  addCylinder(group, 0.16, 0.16, 0.42, [-1.82, 0.05, -0.73], steel, 48)
  addCylinder(group, 0.35, 0.35, 0.2, [-2.2, -0.02, -0.73], black, 64)
  addBox(group, [0.82, 0.12, 0.12], [-2.2, -0.02, -0.34], steel)
  addCylinder(group, 0.06, 0.06, 0.42, [-2.38, -0.22, -0.32], steel, 28)
  addBox(group, [1.04, 0.18, 0.56], [-2.2, -1.2, -0.45], steel)
  addBox(group, [0.72, 0.04, 0.48], [-2.2, 0.58, -0.38], warmLight)
  addCylinder(group, 0.16, 0.12, 0.34, [-0.95, -1.03, 0.36], createMat('#f8fafc', 0.36), 48)
  addCylinder(group, 0.18, 0.18, 0.03, [-0.95, -0.84, 0.36], createMat('#f1f5f9', 0.4), 48)

  enableShadows(group)
  return group
}

function createRestaurantSceneProps() {
  const group = new THREE.Group()
  const table = createMat('#4a2c20', 0.5)
  const plate = createMat('#f8fafc', 0.34)
  const napkin = createMat('#e2e8f0', 0.72)
  const steel = createMat('#d6dee8', 0.22, 0.5)
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#dff6ff',
    roughness: 0.04,
    metalness: 0,
    transmission: 0.35,
    transparent: true,
    opacity: 0.42,
  })

  addCylinder(group, 3.7, 3.7, 0.24, [0, -1.42, -0.15], table, 128)
  addCylinder(group, 0.28, 0.42, 1.5, [0, -2.26, -0.15], createMat('#2b1b14', 0.5), 48)
  addCylinder(group, 0.98, 0.98, 0.06, [1.62, -1.25, -0.34], plate, 96)
  addCylinder(group, 0.64, 0.64, 0.035, [1.62, -1.19, -0.34], createMat('#eef2f7', 0.38), 96)
  addBox(group, [0.56, 0.04, 1.18], [0.8, -1.17, 0.58], napkin, [0, 0.35, 0])
  addCylinder(group, 0.025, 0.025, 1.28, [2.64, -1.14, -0.32], steel, 24, [0, 0, Math.PI / 2])
  addCylinder(group, 0.025, 0.025, 1.1, [0.56, -1.13, -0.35], steel, 24, [0, 0, Math.PI / 2])
  addCylinder(group, 0.24, 0.19, 0.72, [-1.55, -0.86, -0.52], glass, 64)
  addCylinder(group, 0.17, 0.17, 0.03, [-1.55, -0.48, -0.52], glass, 64)
  addCylinder(group, 0.08, 0.08, 0.34, [-1.55, -1.33, -0.52], glass, 48)
  addBox(group, [0.18, 0.06, 0.92], [-2.36, -1.15, 0.18], createMat('#c8a96a', 0.46), [0, -0.4, 0])

  enableShadows(group)
  return group
}

function createHandSceneProps() {
  const group = new THREE.Group()
  const skin = createMat('#c98f65', 0.58)
  const skinLight = createMat('#d9a47c', 0.56)
  const cuff = createMat('#0f766e', 0.48)

  addCapsule(group, 0.27, 1.36, [-1.08, -0.88, 0.32], skin, [0.7, 0.08, -1.02])
  addCapsule(group, 0.18, 1.05, [-0.52, -0.58, 0.72], skinLight, [0.54, -0.08, -0.28])
  addCapsule(group, 0.14, 0.78, [-0.2, -0.43, 0.8], skin, [0.68, -0.22, -0.15])
  addCapsule(group, 0.13, 0.72, [0.06, -0.46, 0.78], skin, [0.7, -0.3, -0.04])
  addCapsule(group, 0.12, 0.64, [0.28, -0.5, 0.72], skin, [0.68, -0.38, 0.06])
  addCapsule(group, 0.13, 0.8, [-0.62, -0.22, 0.28], skinLight, [1.06, 0.32, -0.9])
  addCapsule(group, 0.25, 1.32, [-1.72, -1.24, 0.18], cuff, [0.74, 0.04, -1.04])
  addCylinder(group, 0.09, 0.12, 0.09, [-0.44, -0.05, 0.2], skinLight, 36, [1.05, 0.2, -0.82])

  enableShadows(group)
  return group
}

function createScenarioProps() {
  return {
    cafe: createCafeSceneProps(),
    restro: createRestaurantSceneProps(),
    hand: createHandSceneProps(),
  }
}

function createRealCup(material) {
  const cup = new THREE.Group()
  const parts = {
    lid: new THREE.Group(),
    paper: [],
  }
  const profile = [
    new THREE.Vector2(0.69, -1.24),
    new THREE.Vector2(0.72, -1.16),
    new THREE.Vector2(0.8, -0.72),
    new THREE.Vector2(0.93, -0.05),
    new THREE.Vector2(1.06, 0.72),
    new THREE.Vector2(1.16, 1.18),
    new THREE.Vector2(1.12, 1.23),
  ]
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 224), material)
  body.name = 'printed-cup-body'
  cup.add(body)

  const innerPaperMaterial = new THREE.MeshPhysicalMaterial({
    color: '#fffdf8',
    roughness: 0.68,
    clearcoat: 0.04,
    clearcoatRoughness: 0.86,
    side: THREE.BackSide,
  })
  const innerBody = new THREE.Mesh(new THREE.LatheGeometry(profile, 224), innerPaperMaterial)
  innerBody.name = 'plain-cup-inner'
  cup.add(innerBody)

  const paperEdgeMaterial = new THREE.MeshPhysicalMaterial({
    color: '#fffdf8',
    roughness: 0.46,
    clearcoat: 0.15,
    clearcoatRoughness: 0.7,
  })
  const lidMaterial = new THREE.MeshPhysicalMaterial({
    color: '#f8fafc',
    roughness: 0.36,
    clearcoat: 0.55,
    clearcoatRoughness: 0.42,
  })
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.16, depthWrite: false })

  const topRim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.055, 20, 160), paperEdgeMaterial)
  topRim.rotation.x = Math.PI / 2
  topRim.position.y = 1.22
  cup.add(topRim)
  parts.paper.push(topRim)

  const bottomRim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 16, 144), paperEdgeMaterial)
  bottomRim.rotation.x = Math.PI / 2
  bottomRim.position.y = -1.22
  cup.add(bottomRim)
  parts.paper.push(bottomRim)

  const baseInset = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.08, 160), paperEdgeMaterial)
  baseInset.position.y = -1.25
  cup.add(baseInset)
  parts.paper.push(baseInset)

  const lidBase = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.02, 0.15, 160), lidMaterial)
  lidBase.position.y = 1.27
  parts.lid.add(lidBase)

  const lidDome = new THREE.Mesh(new THREE.SphereGeometry(0.82, 160, 32, 0, Math.PI * 2, 0, Math.PI / 2.35), lidMaterial)
  lidDome.scale.set(1.17, 0.28, 1.17)
  lidDome.position.y = 1.35
  parts.lid.add(lidDome)

  const lidLip = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.035, 16, 144), lidMaterial)
  lidLip.rotation.x = Math.PI / 2
  lidLip.position.y = 1.48
  parts.lid.add(lidLip)

  const sipSlot = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 8, 24), new THREE.MeshStandardMaterial({ color: '#dbe3ea', roughness: 0.42 }))
  sipSlot.rotation.x = Math.PI / 2
  sipSlot.rotation.z = Math.PI / 2
  sipSlot.position.set(0, 1.57, 0.42)
  parts.lid.add(sipSlot)
  cup.add(parts.lid)

  const verticalHighlight = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.0), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false }))
  verticalHighlight.position.set(-0.48, 0.02, 0.93)
  verticalHighlight.rotation.y = -0.43
  cup.add(verticalHighlight)

  const contactShadow = new THREE.Mesh(new THREE.CircleGeometry(0.98, 96), shadowMaterial)
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.position.y = -1.33
  contactShadow.scale.set(1.2, 0.62, 1)
  cup.add(contactShadow)

  enableShadows(cup)
  contactShadow.castShadow = false
  cup.userData.parts = parts
  return cup
}

function RangeControl({ label, value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <label className="range-control">
      <span>{label}<b>{value}{suffix}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function NumberField({ label, value, min, max, step = 1, onChange, suffix = '' }) {
  const updateValue = (nextValue) => {
    const parsed = Number(nextValue)
    if (Number.isNaN(parsed)) return
    onChange(Math.min(max, Math.max(min, parsed)))
  }
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => updateValue(event.target.value)} />
        {suffix && <b>{suffix}</b>}
      </div>
    </label>
  )
}

function ToggleControl({ label, checked, onChange }) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function CheckItem({ label, ok }) {
  return <span className={ok ? 'check-ok' : 'check-warn'}>{label}</span>
}

function downloadUrl(url, filename) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  downloadUrl(url, filename)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function buildDielineSvg({ specs, bleed, safeMargin, seam, barcodeZone, exportWidth, exportHeight }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}mm" height="${exportHeight}mm" viewBox="0 0 ${exportWidth} ${exportHeight}">
  <rect width="${exportWidth}" height="${exportHeight}" fill="#ffffff"/>
  <path d="M${bleed} ${bleed} H${exportWidth - bleed} L${exportWidth - bleed - seam} ${exportHeight - bleed} H${bleed + seam} Z" fill="none" stroke="#0f172a" stroke-width="0.35"/>
  <path d="M0 0 H${exportWidth} V${exportHeight} H0 Z" fill="none" stroke="#38bdf8" stroke-width="0.25" stroke-dasharray="2 1.5"/>
  <path d="M${bleed + safeMargin} ${bleed + safeMargin} H${exportWidth - bleed - safeMargin} L${exportWidth - bleed - seam - safeMargin} ${exportHeight - bleed - safeMargin} H${bleed + seam + safeMargin} Z" fill="none" stroke="#0f766e" stroke-width="0.25" stroke-dasharray="2 1.5"/>
  <line x1="${exportWidth - bleed - seam}" y1="${bleed}" x2="${exportWidth - bleed - seam}" y2="${exportHeight - bleed}" stroke="#f97316" stroke-width="0.35"/>
  <rect x="${exportWidth - bleed - seam - barcodeZone}" y="${exportHeight - bleed - barcodeZone}" width="${barcodeZone}" height="${barcodeZone}" fill="none" stroke="#64748b" stroke-width="0.25" stroke-dasharray="1.5 1"/>
  <text x="${exportWidth / 2}" y="${Math.max(5, bleed + 4)}" font-family="Arial" font-size="4" text-anchor="middle" fill="#334155">${specs.label} wrap ${specs.wrapWidth} x ${specs.wrapHeight} mm | bleed ${bleed} mm | safe ${safeMargin} mm | seam ${seam} mm</text>
</svg>`
}

function DielinePreview({ specs, bleed, seam }) {
  const viewWidth = 360
  const viewHeight = 210
  const topInset = 28
  const bottomInset = 58
  return (
    <svg className="dieline-preview" viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="img" aria-label="Cup dieline preview">
      <path className="dieline-bleed" d={`M${topInset - 10} 34 H${viewWidth - topInset + 10} L${viewWidth - bottomInset + 10} 176 H${bottomInset - 10} Z`} />
      <path className="dieline-cut" d={`M${topInset} 46 H${viewWidth - topInset} L${viewWidth - bottomInset} 164 H${bottomInset} Z`} />
      <path className="dieline-safe" d={`M${topInset + 18} 66 H${viewWidth - topInset - 18} L${viewWidth - bottomInset - 18} 144 H${bottomInset + 18} Z`} />
      <line className="dieline-seam" x1={viewWidth - bottomInset - 6} y1="54" x2={viewWidth - bottomInset - 28} y2="162" />
      <text x="180" y="27">Wrap {specs.wrapWidth} x {specs.wrapHeight} mm</text>
      <text x="180" y="197">Bleed {bleed} mm • Seam {seam} mm</text>
    </svg>
  )
}

async function createCupTexture({
  wrapUrl,
  logoUrl,
  cupColor,
  accentColor,
  brandText,
  logoScale,
  logoOffsetX,
  logoOffsetY,
  wrapOpacity,
  bandStyle,
  showLabelCard,
  showCaption,
  captionText,
}) {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, cupColor)
  gradient.addColorStop(0.5, '#ffffff')
  gradient.addColorStop(1, cupColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const wrapImage = await getDrawableImage(wrapUrl)
  if (wrapImage) {
    ctx.globalAlpha = wrapOpacity
    drawCoverImage(ctx, wrapImage, 0, 0, canvas.width, canvas.height)
    ctx.globalAlpha = 1
  }

  if (bandStyle !== 'none') {
    ctx.fillStyle = accentColor
    if (bandStyle === 'double' || bandStyle === 'top') ctx.fillRect(0, 190, canvas.width, 96)
    if (bandStyle === 'double' || bandStyle === 'bottom') ctx.fillRect(0, canvas.height - 314, canvas.width, 78)
    if (bandStyle === 'wide') ctx.fillRect(0, canvas.height - 520, canvas.width, 240)
  }
  if (!wrapImage) {
    ctx.fillStyle = 'rgba(255,255,255,0.38)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const logoImage = await getDrawableImage(logoUrl)
  ctx.save()
  ctx.translate(canvas.width / 2 + Number(logoOffsetX), canvas.height / 2 - 44 + Number(logoOffsetY))
  if (showLabelCard) {
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)'
    ctx.lineWidth = 15
    ctx.beginPath()
    ctx.roundRect(-640, -430, 1280, 860, 90)
    ctx.fill()
    ctx.stroke()
  }

  if (logoImage) {
    const ratio = Math.min((900 * logoScale) / logoImage.width, (520 * logoScale) / logoImage.height)
    const width = logoImage.width * ratio
    const height = logoImage.height * ratio
    ctx.drawImage(logoImage, -width / 2, -height / 2 - 44, width, height)
  } else {
    drawFittedText(ctx, brandText, 1040 * logoScale, -44, accentColor)
  }

  if (showCaption) {
    ctx.fillStyle = '#0f172a'
    ctx.font = '800 62px Inter, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(captionText || 'CREATE YOUR CUP', 0, 340)
  }
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  texture.userData.sourceCanvas = canvas
  return texture
}

export function CreateCupStudio() {
  const canvasRef = useRef(null)
  const rendererRef = useRef(null)
  const materialRef = useRef(null)
  const textureRequestRef = useRef(0)
  const controlsRef = useRef(null)
  const cupRef = useRef(null)
  const cupPartsRef = useRef(null)
  const lightsRef = useRef(null)
  const sceneSurfacesRef = useRef(null)
  const scenarioPropsRef = useRef(null)
  const sceneBackgroundsRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const autoRotateRef = useRef(true)
  const wrapInputRef = useRef(null)
  const logoInputRef = useRef(null)
  const [scenario, setScenario] = useState('none')
  const [wrapFile, setWrapFile] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [cupColor, setCupColor] = useState('#f3efe4')
  const [accentColor, setAccentColor] = useState('#0f766e')
  const [brandText, setBrandText] = useState('')
  const [artworkPrompt, setArtworkPrompt] = useState(DEFAULT_ARTWORK_PROMPT)
  const [generatedArtworkUrl, setGeneratedArtworkUrl] = useState('')
  const [generatedArtworkUrls, setGeneratedArtworkUrls] = useState([])
  const [generatedArtworkIncludesLogo, setGeneratedArtworkIncludesLogo] = useState(false)
  const [scenePreviewImages, setScenePreviewImages] = useState([])
  const [selectedScenePreview, setSelectedScenePreview] = useState(null)
  const [isGeneratingScenes, setIsGeneratingScenes] = useState(false)
  const [isGeneratingArtwork, setIsGeneratingArtwork] = useState(false)
  const [generationElapsed, setGenerationElapsed] = useState(0)
  const [artworkError, setArtworkError] = useState('')
  const [autoRotate, setAutoRotate] = useState(true)
  const [zoom, setZoom] = useState(sceneViewDefaults.none.zoom)
  const [logoScale, setLogoScale] = useState(1)
  const [logoOffsetX, setLogoOffsetX] = useState(0)
  const [logoOffsetY, setLogoOffsetY] = useState(0)
  const [wrapOpacity, setWrapOpacity] = useState(1)
  const [bandStyle, setBandStyle] = useState('none')
  const [showLabelCard, setShowLabelCard] = useState(false)
  const [showCaption, setShowCaption] = useState(false)
  const [captionText, setCaptionText] = useState('')
  const [lidColor, setLidColor] = useState('#f8fafc')
  const [showLid, setShowLid] = useState(true)
  const [materialFinish, setMaterialFinish] = useState('matte')
  const [exposure, setExposure] = useState(1.08)
  const [lightIntensity, setLightIntensity] = useState(3.1)
  const [fillIntensity, setFillIntensity] = useState(0.8)
  const [rimIntensity, setRimIntensity] = useState(1.4)
  const [cameraHeight, setCameraHeight] = useState(sceneViewDefaults.none.cameraHeight)
  const [cameraX, setCameraX] = useState(sceneViewDefaults.none.cameraX)
  const [cameraFov, setCameraFov] = useState(sceneViewDefaults.none.cameraFov)
  const [cameraTargetY, setCameraTargetY] = useState(sceneViewDefaults.none.cameraTargetY)
  const [surfaceRoughness, setSurfaceRoughness] = useState(0.62)
  const [renderQuality, setRenderQuality] = useState(3)
  const [cupDimensions, setCupDimensions] = useState(cupSizes['12oz'])
  const [paperStock, setPaperStock] = useState('320 gsm PE-free kraft board')
  const [printMethod, setPrintMethod] = useState('CMYK digital')
  const [coating, setCoating] = useState('water-based matte')
  const [bleed, setBleed] = useState(3)
  const [safeMargin, setSafeMargin] = useState(5)
  const [seam, setSeam] = useState(12)
  const [exportFormat, setExportFormat] = useState('PDF/X-4 + PNG preview')
  const [quantity, setQuantity] = useState(500)
  const [barcodeZone, setBarcodeZone] = useState(32)
  const [proofStatus, setProofStatus] = useState('Draft proof')

  const uploadedWrapUrl = useMemo(() => fileToUrl(wrapFile), [wrapFile])
  const wrapUrl = generatedArtworkUrl || uploadedWrapUrl
  const textureLogoUrl = generatedArtworkUrl && generatedArtworkIncludesLogo ? '' : logoUrl
  const activeScenario = scenarios[scenario]
  const selectedCup = cupDimensions
  const exportWidth = selectedCup.wrapWidth + bleed * 2
  const exportHeight = selectedCup.wrapHeight + bleed * 2
  const printReadiness = [
    { label: generatedArtworkUrl || wrapFile ? 'Printable design assigned' : 'Printable design missing', ok: Boolean(generatedArtworkUrl || wrapFile) },
    { label: logoFile || brandText ? 'Brand mark ready' : 'Brand mark missing', ok: Boolean(logoFile || brandText) },
    { label: bleed >= 3 ? 'Bleed is print safe' : 'Bleed below 3 mm', ok: bleed >= 3 },
    { label: safeMargin >= 5 ? 'Safe margin is print safe' : 'Safe margin below 5 mm', ok: safeMargin >= 5 },
    { label: seam >= 10 ? 'Glue seam reserved' : 'Glue seam too narrow', ok: seam >= 10 },
  ]
  const isGeneratingExperience = isGeneratingArtwork || isGeneratingScenes
  const generationStepIndex = Math.min(
    GENERATION_STEPS.length - 1,
    isGeneratingScenes ? 5 : Math.floor(generationElapsed / 6),
  )
  const generationStep = GENERATION_STEPS[generationStepIndex]
  const updateCupDimension = (key, value) => {
    setCupDimensions((current) => ({
      ...current,
      label: 'Custom',
      [key]: value,
    }))
  }

  const handleLogoUpload = async (file) => {
    setLogoFile(file)
    if (generatedArtworkUrl) setGeneratedArtworkIncludesLogo(false)
    setScenePreviewImages([])
    setSelectedScenePreview(null)
    setArtworkError('')
    if (!file) {
      setLogoUrl('')
      return
    }
    try {
      setLogoUrl(await removeLogoBackground(file))
    } catch {
      setLogoUrl(fileToUrl(file))
      setArtworkError('Logo background removal failed, so the original logo was used.')
    }
  }

  const clearWrapFile = () => {
    setWrapFile(null)
    setGeneratedArtworkUrl('')
    setGeneratedArtworkUrls([])
    setGeneratedArtworkIncludesLogo(false)
    setScenePreviewImages([])
    setSelectedScenePreview(null)
    if (wrapInputRef.current) wrapInputRef.current.value = ''
  }

  const clearLogoFile = () => {
    setLogoFile(null)
    setLogoUrl('')
    setScenePreviewImages([])
    setSelectedScenePreview(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const selectScenario = (key) => {
    const defaults = sceneViewDefaults[key]
    setScenario(key)
    if (!defaults) return
    setZoom(defaults.zoom)
    setCameraHeight(defaults.cameraHeight)
    setCameraX(defaults.cameraX)
    setCameraFov(defaults.cameraFov)
    setCameraTargetY(defaults.cameraTargetY)
    setAutoRotate(false)
  }

  const resetEditor = () => {
    setWrapFile(null)
    setLogoFile(null)
    setLogoUrl('')
    if (wrapInputRef.current) wrapInputRef.current.value = ''
    if (logoInputRef.current) logoInputRef.current.value = ''
    setScenePreviewImages([])
    setSelectedScenePreview(null)
    setBrandText('')
    setArtworkPrompt(DEFAULT_ARTWORK_PROMPT)
    setGeneratedArtworkUrl('')
    setGeneratedArtworkUrls([])
    setGeneratedArtworkIncludesLogo(false)
    setArtworkError('')
    setCaptionText('')
    setCupColor('#f3efe4')
    setAccentColor(activeScenario.accent)
    setLogoScale(1)
    setLogoOffsetX(0)
    setLogoOffsetY(0)
    setWrapOpacity(1)
    setBandStyle('none')
    setShowLabelCard(false)
    setShowCaption(false)
    setLidColor('#f8fafc')
    setShowLid(true)
    setMaterialFinish('matte')
    setExposure(1.08)
    setLightIntensity(3.1)
    setFillIntensity(0.8)
    setRimIntensity(1.4)
    setCameraHeight(sceneViewDefaults[scenario].cameraHeight)
    setCameraX(sceneViewDefaults[scenario].cameraX)
    setCameraFov(sceneViewDefaults[scenario].cameraFov)
    setCameraTargetY(sceneViewDefaults[scenario].cameraTargetY)
    setSurfaceRoughness(0.62)
    setRenderQuality(3)
    setZoom(sceneViewDefaults[scenario].zoom)
    setAutoRotate(true)
    setCupDimensions(cupSizes['12oz'])
    setBleed(3)
    setSafeMargin(5)
    setSeam(12)
    setQuantity(500)
    setBarcodeZone(32)
    setProofStatus('Draft proof')
    const cup = cupRef.current
    if (cup) {
      const pose = getCupPose(scenario)
      cup.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2])
    }
  }

  const setCupAngle = (angle) => {
    const cup = cupRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!cup || !camera || !controls) return
    setAutoRotate(false)
    setCameraX(0)
    cup.rotation.y = angle
    camera.position.set(0, Number(cameraHeight), Number(zoom))
    camera.updateProjectionMatrix()
    controls.target.set(0, Number(cameraTargetY), 0)
    controls.update()
    rendererRef.current?.render?.(sceneRef.current, cameraRef.current)
  }

  const exportPreviewPng = () => {
    if (selectedScenePreview?.imageUrl) {
      downloadUrl(selectedScenePreview.imageUrl, `${selectedScenePreview.id || 'lifestyle-cup'}.png`)
      return
    }
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    if (!renderer || !scene || !camera) return
    renderer.render(scene, camera)
    downloadUrl(renderer.domElement.toDataURL('image/png'), `cup-preview-${scenario}.png`)
  }

  const exportPrintDesignPng = async () => {
    const texture = await createCupTexture({
      wrapUrl,
      logoUrl: textureLogoUrl,
      cupColor,
      accentColor,
      brandText,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      wrapOpacity,
      bandStyle,
      showLabelCard,
      showCaption,
      captionText,
    })
    const sourceCanvas = texture?.userData.sourceCanvas
    if (!texture || !sourceCanvas) return
    downloadUrl(sourceCanvas.toDataURL('image/png'), `printable-cup-wrap-${selectedCup.label.toLowerCase().replace(/\s+/g, '-')}.png`)
    texture.dispose()
  }

  const exportDielineSvg = () => {
    downloadBlob(
      buildDielineSvg({ specs: selectedCup, bleed, safeMargin, seam, barcodeZone, exportWidth, exportHeight }),
      `cup-dieline-${selectedCup.label.toLowerCase().replace(/\s+/g, '-')}.svg`,
      'image/svg+xml',
    )
  }

  const exportProductionSpec = () => {
    const spec = {
      product: 'Create Your Cup',
      proofStatus,
      scenario,
      dimensionsMm: selectedCup,
      exportCanvasMm: { width: exportWidth, height: exportHeight },
      texturePixels: { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
      dieline: { bleed, safeMargin, seam, barcodeZone },
      production: { quantity, printMethod, paperStock, coating, exportFormat },
      design: {
        brandText,
        captionText,
        cupColor,
        accentColor,
        bandStyle,
        logoScale,
        logoOffsetX,
        logoOffsetY,
        wrapOpacity,
        hasGeneratedDesign: Boolean(generatedArtworkUrl),
        hasUploadedDesign: Boolean(wrapFile),
        hasUploadedLogo: Boolean(logoFile),
      },
      camera: { zoom, cameraHeight, cameraX, cameraFov, cameraTargetY, exposure, lightIntensity, fillIntensity, rimIntensity, surfaceRoughness },
      readiness: printReadiness,
    }
    downloadBlob(JSON.stringify(spec, null, 2), `cup-production-spec-${selectedCup.label.toLowerCase().replace(/\s+/g, '-')}.json`, 'application/json')
  }

  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  useEffect(() => {
    if (!isGeneratingExperience) {
      return undefined
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setGenerationElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isGeneratingExperience])

  useEffect(() => {
    return () => {
      if (uploadedWrapUrl) URL.revokeObjectURL(uploadedWrapUrl)
      if (logoUrl.startsWith('blob:')) URL.revokeObjectURL(logoUrl)
    }
  }, [uploadedWrapUrl, logoUrl])

  const generateArtwork = async () => {
    setArtworkError('')
    setScenePreviewImages([])
    setSelectedScenePreview(null)
    setGenerationElapsed(0)
    setIsGeneratingArtwork(true)
    try {
      const logoDataUrl = logoUrl.startsWith('data:') ? logoUrl : await fileToDataUrl(logoFile)
      const prompt = buildProductionArtworkPrompt(artworkPrompt, Boolean(logoDataUrl))
      const response = await fetch('/api/generate-artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          count: 3,
          logoImage: logoDataUrl
            ? {
              dataUrl: logoDataUrl,
              name: logoFile.name,
              type: logoFile.type,
            }
            : null,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Unable to generate artwork with OpenAI.')
      }
      const variations = data.imageUrls?.length ? data.imageUrls : [data.imageUrl].filter(Boolean)
      setGeneratedArtworkUrls(variations)
      setGeneratedArtworkUrl(variations[0] || '')
      setGeneratedArtworkIncludesLogo(Boolean(logoDataUrl))
    } catch (error) {
      setArtworkError(error.message)
      setIsGeneratingScenes(false)
    } finally {
      setIsGeneratingArtwork(false)
    }
  }

  const getCurrentDesignDataUrl = useCallback(async () => {
    const texture = await createCupTexture({
      wrapUrl,
      logoUrl: textureLogoUrl,
      cupColor,
      accentColor,
      brandText,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      wrapOpacity,
      bandStyle,
      showLabelCard,
      showCaption,
      captionText,
    })
    const sourceCanvas = texture?.userData.sourceCanvas
    const dataUrl = sourceCanvas?.toDataURL('image/png') || ''
    texture?.dispose()
    return dataUrl
  }, [wrapUrl, textureLogoUrl, cupColor, accentColor, brandText, logoScale, logoOffsetX, logoOffsetY, wrapOpacity, bandStyle, showLabelCard, showCaption, captionText])

  const placeCupInLifestyleImages = useCallback(async (designOverride = null) => {
    setArtworkError('')
    setScenePreviewImages([])
    setSelectedScenePreview(null)
    setGenerationElapsed(0)
    setIsGeneratingScenes(true)
    try {
      const designDataUrl = designOverride || await getCurrentDesignDataUrl()
      if (!designDataUrl) throw new Error('Generate or upload a cup design first.')
      const sceneImages = await Promise.all(hardcodedLifestyleImages.map(async (image) => ({
        id: image.id,
        label: image.label,
        name: image.name,
        dataUrl: await urlToDataUrl(image.url),
      })))
      const response = await fetch('/api/place-cup-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designImage: {
            dataUrl: designDataUrl,
            name: 'selected-cup-design.png',
          },
          sceneImages,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Unable to place cup in lifestyle images.')
      }
      const scenes = data.scenes || []
      setScenePreviewImages(scenes)
      setSelectedScenePreview(scenes[0] || null)
    } catch (error) {
      setArtworkError(error.message)
    } finally {
      setIsGeneratingScenes(false)
    }
  }, [getCurrentDesignDataUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window.WebGLRenderingContext === 'undefined') return undefined

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.fog = null
    sceneRef.current = scene
    const textureLoader = new THREE.TextureLoader()
    const backgroundTextures = Object.fromEntries(Object.entries(sceneImageUrls).map(([key, url]) => {
      const texture = textureLoader.load(url)
      texture.colorSpace = THREE.SRGBColorSpace
      return [key, texture]
    }))
    scene.background = new THREE.Color(scenarios.none.background)
    sceneBackgroundsRef.current = backgroundTextures
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 1.2, 5.05)
    cameraRef.current = camera

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: '#c9965e',
      roughness: 0.62,
      metalness: 0.02,
    })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1.34
    floor.receiveShadow = true
    floor.visible = false
    scene.add(floor)

    const backdropMaterial = new THREE.MeshBasicMaterial({ color: '#f3eadc' })
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(18, 10), backdropMaterial)
    backdrop.position.set(0, 2.2, -4.8)
    backdrop.visible = false
    scene.add(backdrop)
    sceneSurfacesRef.current = { floor, floorMaterial, backdrop, backdropMaterial }

    const scenarioProps = createScenarioProps()
    Object.entries(scenarioProps).forEach(([key, group]) => {
      group.visible = false
      scene.add(group)
    })
    scenarioPropsRef.current = scenarioProps

    const keyLight = new THREE.DirectionalLight('#ffffff', 3.1)
    keyLight.position.set(3, 5, 4)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.camera.near = 0.5
    keyLight.shadow.camera.far = 12
    keyLight.shadow.camera.left = -4
    keyLight.shadow.camera.right = 4
    keyLight.shadow.camera.top = 4
    keyLight.shadow.camera.bottom = -4
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight('#f7f0e8', 0.95)
    fillLight.position.set(-3, 2.5, 2)
    scene.add(fillLight)
    const rimLight = new THREE.DirectionalLight('#99f6e4', 1.4)
    rimLight.position.set(-2.6, 3.2, -3.4)
    scene.add(rimLight)
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#9aa8a2', 1.25)
    scene.add(hemiLight)
    lightsRef.current = { keyLight, fillLight, rimLight, hemiLight }

    const material = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.06,
      clearcoatRoughness: 0.82,
      side: THREE.FrontSide,
    })
    materialRef.current = material

    const cup = createRealCup(material)
    cup.position.y = 0.08
    scene.add(cup)
    cupRef.current = cup
    cupPartsRef.current = cup.userData.parts

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 3.8
    controls.maxDistance = 7.2
    controls.target.set(0, 0, 0)
    controlsRef.current = controls

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    resize()
    resizeObserver?.observe(canvas)
    window.addEventListener('resize', resize)

    let frame = 0
    const animate = () => {
      frame = window.requestAnimationFrame(animate)
      if (autoRotateRef.current) cup.rotation.y += 0.006
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      resizeObserver?.disconnect()
      controls.dispose()
      scene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose?.()
          if (Array.isArray(child.material)) child.material.forEach((item) => item.dispose?.())
          else child.material?.dispose?.()
        }
      })
      renderer.dispose()
      Object.values(sceneBackgroundsRef.current || {}).forEach((texture) => texture.dispose?.())
      rendererRef.current = null
      lightsRef.current = null
      sceneSurfacesRef.current = null
      scenarioPropsRef.current = null
      sceneBackgroundsRef.current = null
      cupPartsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!materialRef.current) return undefined
    const requestId = textureRequestRef.current + 1
    textureRequestRef.current = requestId
    let disposed = false
    createCupTexture({
      wrapUrl,
      logoUrl: textureLogoUrl,
      cupColor,
      accentColor,
      brandText,
      logoScale,
      logoOffsetX,
      logoOffsetY,
      wrapOpacity,
      bandStyle,
      showLabelCard,
      showCaption,
      captionText,
    }).then((texture) => {
      if (!texture) return
      if (disposed || requestId !== textureRequestRef.current) {
        texture.dispose()
        return
      }
      const material = materialRef.current
      if (!material) return
      if (material.map) material.map.dispose()
      texture.anisotropy = rendererRef.current?.capabilities.getMaxAnisotropy?.() ?? 1
      material.map = texture
      material.needsUpdate = true
      rendererRef.current?.render?.(sceneRef.current, cameraRef.current)
    }).catch(() => {
      if (requestId === textureRequestRef.current) setArtworkError('Unable to refresh printable design preview.')
    })
    return () => {
      disposed = true
    }
  }, [wrapUrl, textureLogoUrl, cupColor, accentColor, brandText, logoScale, logoOffsetX, logoOffsetY, wrapOpacity, bandStyle, showLabelCard, showCaption, captionText])

  useEffect(() => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const cup = cupRef.current
    if (!scene || !camera || !controls || !cup) return

    const next = scenarios[scenario]
    const pose = getCupPose(scenario)
    const backgroundTexture = sceneBackgroundsRef.current?.[scenario]
    scene.background = backgroundTexture || new THREE.Color(next.background)
    scene.fog = scenario === 'none' ? new THREE.FogExp2(next.background, next.fog) : null
    const surfaces = sceneSurfacesRef.current
    if (surfaces) {
      surfaces.floor.visible = scenario === 'none'
      surfaces.backdrop.visible = scenario === 'none'
      surfaces.floorMaterial.color.set(next.floor)
      surfaces.floorMaterial.roughness = Number(surfaceRoughness)
      surfaces.floorMaterial.needsUpdate = true
      surfaces.backdropMaterial.color.set(next.backdrop)
      surfaces.backdropMaterial.needsUpdate = true
    }
    const lights = lightsRef.current
    if (lights) {
      lights.keyLight.color.set(next.key)
      lights.fillLight.color.set(next.fill)
      lights.rimLight.color.set(next.rim)
    }
    const scenarioProps = scenarioPropsRef.current
    if (scenarioProps) {
      Object.values(scenarioProps).forEach((group) => {
        group.visible = false
      })
    }
    cup.position.set(pose.position[0], pose.position[1], pose.position[2])
    cup.rotation.x = pose.rotation[0]
    cup.rotation.z = pose.rotation[2]
    cup.rotation.y = pose.rotation[1]
    camera.fov = Number(cameraFov)
    camera.position.set(Number(cameraX), Number(cameraHeight), Number(zoom))
    camera.updateProjectionMatrix()
    controls.target.set(0, Number(cameraTargetY), 0)
    controls.update()
  }, [scenario, zoom, cameraHeight, cameraX, cameraFov, cameraTargetY, surfaceRoughness])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Number(renderQuality)))
  }, [renderQuality])

  useEffect(() => {
    const renderer = rendererRef.current
    if (renderer) renderer.toneMappingExposure = Number(exposure)
    const lights = lightsRef.current
    if (lights) {
      lights.keyLight.intensity = Number(lightIntensity)
      lights.fillLight.intensity = Number(fillIntensity)
      lights.rimLight.intensity = Number(rimIntensity)
      lights.hemiLight.intensity = Math.max(0.6, Number(lightIntensity) * 0.38)
    }
  }, [exposure, lightIntensity, fillIntensity, rimIntensity])

  useEffect(() => {
    const material = materialRef.current
    if (!material) return
    const finishes = {
      matte: { roughness: 0.82, clearcoat: 0.02, clearcoatRoughness: 0.9 },
      satin: { roughness: 0.58, clearcoat: 0.18, clearcoatRoughness: 0.62 },
      gloss: { roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.32 },
    }
    const next = finishes[materialFinish]
    material.roughness = next.roughness
    material.clearcoat = next.clearcoat
    material.clearcoatRoughness = next.clearcoatRoughness
    material.needsUpdate = true
  }, [materialFinish])

  useEffect(() => {
    const parts = cupPartsRef.current
    if (!parts) return
    parts.lid.visible = showLid
    parts.lid.traverse((child) => {
      if (child.isMesh && child.material?.color) child.material.color.set(lidColor)
    })
  }, [showLid, lidColor])

  useEffect(() => {
    const cup = cupRef.current
    if (!cup) return
    const placementScale = sceneModelPlacement[scenario]?.scale ?? 1
    const diameterScale = Math.max(0.72, Math.min(1.28, selectedCup.top / 90)) * placementScale * CUP_MODEL_WIDTH_SCALE
    const heightScale = Math.max(0.72, Math.min(1.32, selectedCup.height / 112)) * placementScale
    cup.scale.set(diameterScale, heightScale, diameterScale)
  }, [scenario, selectedCup.top, selectedCup.height])

  return (
    <main className={`cup-editor cup-editor-${scenario}`}>
      <aside className="editor-sidebar">
        <div>
          <p className="editor-kicker">Create Your Cup</p>
          <h1>CUP STUDIO</h1>
          {/* <p className="editor-copy">Generate a printable cup wrap, place your logo, and preview the same cup in real customer scenarios.</p> */}
        </div>

        <section className="editor-panel">
            <h2>Write Prompt to Generate Design</h2>
            <label className="editor-field">
              {/* <span>Printable design prompt</span> */}
              <textarea
                className="prompt-input"
                value={artworkPrompt}
                onChange={(event) => setArtworkPrompt(event.target.value)}
                placeholder="Example: minimal botanical cafe packaging with warm green accents"
              />
            </label>
            <div className="prompt-actions">
              <Button type="button" disabled={isGeneratingArtwork || artworkPrompt.trim().length < 8} onClick={generateArtwork}>
                {isGeneratingArtwork ? 'Generating...' : 'Generate Design'}
              </Button>
              {generatedArtworkUrl && <button className="clear-button" type="button" onClick={() => {
                setGeneratedArtworkUrl('')
                setGeneratedArtworkUrls([])
                setGeneratedArtworkIncludesLogo(false)
                setScenePreviewImages([])
                setSelectedScenePreview(null)
              }}>Clear generated image</button>}
            </div>
            {artworkError && <p className="editor-error">{artworkError}</p>}
            {isGeneratingExperience && (
              <div className="generation-progress" role="status" aria-live="polite">
                <div className="generation-progress-top">
                  <span>{generationStep}</span>
                  <b>{generationElapsed < 60 ? `${generationElapsed}s` : `${Math.floor(generationElapsed / 60)}m ${generationElapsed % 60}s`}</b>
                </div>
                <div className="generation-bar">
                  <i style={{ width: `${Math.min(92, 18 + generationStepIndex * 14 + (generationElapsed % 6) * 2)}%` }} />
                </div>
                <p>{isGeneratingScenes ? 'Replacing the cup in the fixed lifestyle image now.' : 'OpenAI is creating polished packaging options. You can keep editing after the designs arrive.'}</p>
              </div>
            )}
            {isGeneratingArtwork && generatedArtworkUrls.length === 0 && (
              <div className="variation-grid variation-grid-loading" aria-hidden="true">
                {[0, 1, 2].map((item) => (
                  <div className="loading-tile" key={item}>
                    <span>{item + 1}</span>
                  </div>
                ))}
              </div>
            )}
            {generatedArtworkUrls.length > 0 && (
              <div className="variation-grid" aria-label="Generated design variations">
                {generatedArtworkUrls.map((url, index) => (
                  <button
                    className={generatedArtworkUrl === url ? 'active' : ''}
                    key={url}
                    type="button"
                    onClick={() => {
                      setGeneratedArtworkUrl(url)
                      setScenePreviewImages([])
                      setSelectedScenePreview(null)
                    }}
                    title={`Use generated design ${index + 1}`}
                    aria-label={`Use generated design ${index + 1}`}
                  >
                    <img src={url} alt="" />
                    <span>{index + 1}</span>
                  </button>
                ))}
              </div>
            )}
            <label className="editor-upload">
              <span><ImageUp size={16} /> Print design upload</span>
              <div className="upload-file-row">
                <Input ref={wrapInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => {
                  setWrapFile(event.target.files?.[0] ?? null)
                  setGeneratedArtworkUrl('')
                  setGeneratedArtworkUrls([])
                  setGeneratedArtworkIncludesLogo(false)
                  setScenePreviewImages([])
                  setSelectedScenePreview(null)
                }} />
                {(wrapFile || generatedArtworkUrl) && (
                  <button className="remove-file-button" type="button" onClick={clearWrapFile} title="Remove image file" aria-label="Remove image file">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </label>
            <label className="editor-upload">
              <span><ImageUp size={16} /> Logo</span>
              <div className="upload-file-row">
                <Input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => handleLogoUpload(event.target.files?.[0] ?? null)} />
                {logoFile && (
                  <button className="remove-file-button" type="button" onClick={clearLogoFile} title="Remove logo file" aria-label="Remove logo file">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </label>
            <Button type="button" disabled={isGeneratingScenes || (!generatedArtworkUrl && !wrapFile)} onClick={() => placeCupInLifestyleImages()}>
              {isGeneratingScenes ? 'Creating lifestyle image...' : 'Create lifestyle image'}
            </Button>
            <ToggleControl label="Show plastic lid" checked={showLid} onChange={setShowLid} />
            <label className="editor-field">
              <span>Lid color</span>
              <input type="color" value={lidColor} onChange={(event) => setLidColor(event.target.value)} />
            </label>
            <label className="editor-field">
              <span>Export package</span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="PDF/X-4 + PNG preview">PDF/X-4 + PNG preview</option>
                <option value="AI dieline + 300 DPI printable design">AI dieline + 300 DPI printable design</option>
                <option value="SVG dieline + transparent PNG">SVG dieline + transparent PNG</option>
              </select>
            </label>
            <div className="export-actions">
              <Button type="button" onClick={exportPreviewPng}><Download size={16} /> Preview PNG</Button>
              <Button type="button" onClick={exportPrintDesignPng}><Download size={16} /> Print design PNG</Button>
              <button className="clear-button" type="button" onClick={exportDielineSvg}><Download size={15} /> Dieline SVG</button>
              <button className="clear-button" type="button" onClick={exportProductionSpec}><Download size={15} /> Spec JSON</button>
            </div>
        </section>
      </aside>

      <section className="editor-stage">
        <div className="stage-toolbar">
          <div>
            <span>{selectedScenePreview ? 'Lifestyle image' : activeScenario.label}</span>
            <strong>
              {selectedScenePreview
                ? selectedScenePreview.label
                : scenario === 'none'
                ? 'Clean studio preview'
                : scenario === 'hand'
                  ? 'Customer hand preview'
                  : `${activeScenario.label} preview`}
            </strong>
          </div>
          <div className="stage-status">{selectedScenePreview ? 'Download from camera button' : 'Drag to rotate'}</div>
        </div>
        <div className="canvas-control-hub" aria-label="Canvas cup controls">
          <button className="canvas-pill-button" type="button" onClick={resetEditor} title="Reset editor">
            <RotateCcw size={16} />
            Reset
          </button>
          <button className="canvas-icon-button canvas-play-button" type="button" onClick={() => setAutoRotate((value) => !value)} title={autoRotate ? 'Pause rotation' : 'Play rotation'} aria-label={autoRotate ? 'Pause rotation' : 'Play rotation'}>
            {autoRotate ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="canvas-icon-button" type="button" onClick={exportPreviewPng} title={selectedScenePreview ? 'Download selected lifestyle image' : 'Capture preview'} aria-label={selectedScenePreview ? 'Download selected lifestyle image' : 'Capture preview image'}>
            <Camera size={17} />
          </button>
          <div className="canvas-scene-controls" aria-label="Scene presets">
            {Object.entries(scenarios).map(([key, item]) => {
              const Icon = item.icon
              return (
                <button className={scenario === key ? 'active' : ''} key={key} type="button" onClick={() => selectScenario(key)} title={item.label} aria-label={`Switch to ${item.label} scene`}>
                  <Icon size={15} />
                </button>
              )
            })}
          </div>
          <div className="canvas-angle-controls" aria-label="Cup angle presets">
            <button type="button" onClick={() => setCupAngle(Math.PI)} title="Front angle">Front</button>
            <button type="button" onClick={() => setCupAngle(Math.PI / 2)} title="Right angle">Right</button>
            <button type="button" onClick={() => setCupAngle(0)} title="Back angle">Back</button>
            <button type="button" onClick={() => setCupAngle(-Math.PI / 2)} title="Left angle">Left</button>
          </div>
        </div>
        {isGeneratingExperience && (
          <div className="stage-generation-overlay" role="status" aria-live="polite">
            <div className="stage-generation-card">
              <span>AI studio</span>
              <strong>{generationStep}</strong>
              <p>{isGeneratingScenes ? 'Replacing the cup in the fixed lifestyle image.' : 'Your cup preview will update as soon as the first design is ready.'}</p>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className={selectedScenePreview ? 'cup-canvas cup-canvas-muted' : 'cup-canvas'} aria-label="3D cup editor preview" />
        {selectedScenePreview && (
          <div className="lifestyle-stage-preview">
            <img src={selectedScenePreview.imageUrl} alt={selectedScenePreview.label} />
          </div>
        )}
        {scenePreviewImages.length > 1 && (
          <div className="lifestyle-stage-switcher" aria-label="Lifestyle image selector">
            {scenePreviewImages.map((scene, index) => (
              <button
                className={selectedScenePreview?.imageUrl === scene.imageUrl ? 'active' : ''}
                key={scene.id || scene.imageUrl}
                type="button"
                onClick={() => setSelectedScenePreview(scene)}
                title={`Show ${scene.label}`}
                aria-label={`Show lifestyle image ${index + 1}`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        )}
      </section>

      <aside className="details-sidebar">
        <section className="details-panel">
          <div className="details-heading">
            <span>Editable Dimensions</span>
            <h2>{selectedCup.label} Cup</h2>
          </div>
          <div className="editable-grid">
            <NumberField label="Top diameter" value={selectedCup.top} min={60} max={120} step={1} suffix="mm" onChange={(value) => updateCupDimension('top', value)} />
            <NumberField label="Bottom diameter" value={selectedCup.bottom} min={40} max={90} step={1} suffix="mm" onChange={(value) => updateCupDimension('bottom', value)} />
            <NumberField label="Cup height" value={selectedCup.height} min={70} max={170} step={1} suffix="mm" onChange={(value) => updateCupDimension('height', value)} />
            <NumberField label="Wrap width" value={selectedCup.wrapWidth} min={180} max={360} step={1} suffix="mm" onChange={(value) => updateCupDimension('wrapWidth', value)} />
            <NumberField label="Wrap height" value={selectedCup.wrapHeight} min={70} max={170} step={1} suffix="mm" onChange={(value) => updateCupDimension('wrapHeight', value)} />
            <NumberField label="Quantity" value={quantity} min={50} max={100000} step={50} suffix="pcs" onChange={setQuantity} />
          </div>
          <div className="detail-list">
            <DetailRow label="Export canvas" value={`${exportWidth} x ${exportHeight} mm`} />
            <DetailRow label="Texture pixels" value={`${TEXTURE_WIDTH} x ${TEXTURE_HEIGHT}`} />
          </div>
        </section>

        <section className="details-panel">
          <div className="details-heading">
            <span>Dieline Controls</span>
            <h2>Cup Die Design</h2>
          </div>
          <div className="editable-grid">
            <NumberField label="Bleed" value={bleed} min={2} max={8} step={0.5} suffix="mm" onChange={setBleed} />
            <NumberField label="Safe margin" value={safeMargin} min={3} max={12} step={0.5} suffix="mm" onChange={setSafeMargin} />
            <NumberField label="Glue seam" value={seam} min={8} max={22} step={1} suffix="mm" onChange={setSeam} />
            <NumberField label="Barcode zone" value={barcodeZone} min={20} max={60} step={1} suffix="mm" onChange={setBarcodeZone} />
          </div>
          <DielinePreview specs={selectedCup} bleed={bleed} seam={seam} />
          <div className="legend-grid">
            <span><i className="legend-cut" /> Cut line</span>
            <span><i className="legend-safe" /> Safe area</span>
            <span><i className="legend-bleed" /> Bleed</span>
            <span><i className="legend-seam" /> Glue seam</span>
          </div>
        </section>

        <section className="details-panel">
          <div className="details-heading">
            <span>Production Export</span>
            <h2>Print Package</h2>
          </div>
          <div className="production-fields">
            <label className="editor-field">
              <span>Export format</span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="PDF/X-4 + PNG preview">PDF/X-4 + PNG preview</option>
                <option value="AI dieline + 300 DPI printable design">AI dieline + 300 DPI printable design</option>
                <option value="SVG dieline + transparent PNG">SVG dieline + transparent PNG</option>
              </select>
            </label>
            <label className="editor-field">
              <span>Print method</span>
              <select value={printMethod} onChange={(event) => setPrintMethod(event.target.value)}>
                <option value="CMYK digital">CMYK digital</option>
                <option value="Offset litho">Offset litho</option>
                <option value="Flexographic">Flexographic</option>
              </select>
            </label>
            <label className="editor-field">
              <span>Paper stock</span>
              <select value={paperStock} onChange={(event) => setPaperStock(event.target.value)}>
                <option value="280 gsm white cup stock">280 gsm white cup stock</option>
                <option value="320 gsm PE-free kraft board">320 gsm PE-free kraft board</option>
                <option value="350 gsm double-wall board">350 gsm double-wall board</option>
              </select>
            </label>
            <label className="editor-field">
              <span>Coating</span>
              <select value={coating} onChange={(event) => setCoating(event.target.value)}>
                <option value="water-based matte">Water-based matte</option>
                <option value="aqueous satin">Aqueous satin</option>
                <option value="compostable PLA lining">Compostable PLA lining</option>
              </select>
            </label>
            <label className="editor-field">
              <span>Proof status</span>
              <select value={proofStatus} onChange={(event) => setProofStatus(event.target.value)}>
                <option value="Draft proof">Draft proof</option>
                <option value="Client review">Client review</option>
                <option value="Prepress check">Prepress check</option>
                <option value="Approved for print">Approved for print</option>
              </select>
            </label>
          </div>
          <div className="detail-list">
            <DetailRow label="Color mode" value={printMethod.includes('CMYK') ? 'CMYK' : 'Printer profile'} />
            <DetailRow label="Resolution" value="300 DPI minimum" />
            <DetailRow label="Proof" value={proofStatus} />
          </div>
        </section>

        <section className="details-panel">
          <div className="details-heading">
            <span>Checks</span>
            <h2>Remaining Prep</h2>
          </div>
          <div className="check-list">
            {printReadiness.map((item) => <CheckItem key={item.label} label={item.label} ok={item.ok} />)}
            <CheckItem label="Keep critical logo/text inside safe area" ok />
            <CheckItem label="Extend print design background to bleed edge" ok />
            <CheckItem label="Confirm dieline with vendor before mass print" ok={proofStatus === 'Approved for print'} />
          </div>
        </section>
      </aside>
    </main>
  )
}
