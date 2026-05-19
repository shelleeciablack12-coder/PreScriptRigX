const subjectsListUrl = 'subjects.json'

const el = id => document.getElementById(id)
const subjectsGrid = el('subjectsGrid')
const homeView = el('home')
const subjectView = el('subjectView')
const subjectTitle = el('subjectTitle')
const backHome = el('backHome')
const fileList = el('fileList')
const fileContent = el('fileContent')
const searchInput = el('searchInput')
const panelArea = el('panelArea')
const sectionSelection = el('sectionSelection')

let current = {subject:null,section:null,manifest:null,searchTerm:''}
let activePdf = null
let pdfRenderToken = 0
let resizeTimer = null

function setPdfViewing(active){
  document.body.classList.toggle('pdf-viewing', active)
}

function exitPdfView(){
  if(activePdf){
    activePdf = null
    fileContent.innerHTML = ''
  }
  setPdfViewing(false)
}

async function fetchJson(url){
  const r = await fetch(url)
  if(!r.ok) throw new Error('Failed to fetch '+url)
  return r.json()
}

async function init(){
  const subjects = await fetchJson(subjectsListUrl)
  renderHome(subjects)
  if(searchInput){
    searchInput.addEventListener('input', () => {
      current.searchTerm = searchInput.value.trim().toLowerCase()
      renderFileList()
    })
  }
  window.onpopstate = evt => {
    const state = evt.state || {}
    if(state.page === 'subject') openSubject(state.subject, state.section, false)
    else showHome(false)
  }
}

function renderHome(subjects){
  subjectsGrid.innerHTML = ''
  subjects.forEach(s => {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `<h3>${s.name}</h3><p>Open ${s.name} folder</p>`
    card.addEventListener('click',()=>openSubject(s.folder,'notes',true))
    subjectsGrid.appendChild(card)
  })
}

async function openSubject(folder, section='notes', push=true){
  try{
    let manifest = {notes:[], pastPapers:[], pastPapersAnswers:[]}
    try{
      const m = await fetchJson(`subjects/${folder}/manifest.json`)
      if(m) manifest = m
    }catch(_) {
      // A missing manifest is fine; the subject will show empty sections.
    }
    current.subject = {name: folder, folder}
    current.manifest = manifest
    current.searchTerm = ''
    if(searchInput) searchInput.value = ''
    showSubjectView()
    sectionSelection.classList.remove('hidden')
    panelArea.classList.add('hidden')
    if(push) history.pushState({page:'subject',subject:folder,section}, '', `#${folder}/${section}`)
  }catch(e){
    alert('Unexpected error loading subject: '+e.message)
  }
}

function showSubjectView(){
  exitPdfView()
  homeView.classList.add('hidden')
  subjectView.classList.remove('hidden')
  subjectTitle.textContent = current.subject.name
}

function showHome(push=true){
  exitPdfView()

  subjectView.classList.add('hidden')
  homeView.classList.remove('hidden')
  current = {subject:null,section:null,manifest:null,searchTerm:''}
  if(push) history.pushState({},'', '#')
}

async function setSection(section){
  current.section = section
  current.searchTerm = ''
  if(searchInput) searchInput.value = ''
  updatePath()
  return renderFileList()
}

function updatePath(){
}

function renderFileList(){
  const uploadRow = fileList.querySelector('.upload-row')
  fileList.innerHTML = ''
  if(uploadRow) fileList.appendChild(uploadRow)
  const sectionKey = current.section
  const entries = current.manifest[sectionKey] || []
  const search = (current.searchTerm || '').toLowerCase()
  const filtered = search
    ? entries.filter(e => {
        const title = (e.title || '').toString().toLowerCase()
        const type = (e.type || e.file || '').toString().toLowerCase()
        const year = (e.year || '').toString().toLowerCase()
        return title.includes(search) || type.includes(search) || year.includes(search)
      })
    : entries

  if(filtered.length===0){
    const msg = document.createElement('div')
    msg.className = 'file-item'
    msg.textContent = search ? 'No matching files found.' : 'No files in this section.'
    fileList.appendChild(msg)
    if(!search) exitPdfView()
    fileContent.innerHTML = ''
    return 0
  }
  entries.forEach(e=>{
    const node = document.createElement('button')
    node.type = 'button'
    node.className = 'file-item'
    node.textContent = e.title
    node.addEventListener('click', ()=>{
      fileList.querySelectorAll('.file-item.active').forEach(item => item.classList.remove('active'))
      node.classList.add('active')
      const year = e.year || e.title
      const type = e.type || e.file
      openPDF(current.subject.name, year, type, entries.indexOf(e))
    })
    fileList.appendChild(node)
  })
  fileContent.innerHTML = ''
  return entries.length
}

function openPDF(subject, year, type, paperIndex=null){
  const entries = current.manifest?.[current.section] || []
  const entry = entries.find(item =>
    item.year === year ||
    item.type === type ||
    item.file === type ||
    item.title === year
  )

  if(!entry){
    fileContent.innerHTML = `<p style="color:#f88">PDF not found for ${subject} ${year} ${type}.</p>`
    return
  }

  const pdfPath = `./subjects/${subject}/${entry.file}`
  const index = paperIndex ?? entries.indexOf(entry)
  loadPdf(pdfPath, entry.title, index)
}

async function loadFile(path){
  try{
    const lower = (path||'').toString().toLowerCase()
    const isPdf = lower.endsWith('.pdf') || lower.includes('.pdf?')
    if(isPdf){
      return loadPdf(path)
    }

    exitPdfView()
    const r = await fetch(path)
    if(!r.ok) throw new Error('Failed to fetch file')
    const text = await r.text()
    fileContent.innerHTML = text
  }catch(e){
    fileContent.innerHTML = `<p style="color:#f88">Error loading file: ${e.message}</p>`
  }
}

async function loadPdf(path, title='PDF viewer', paperIndex=0){
  const rawBase = (path||'').toString().split('#')[0]
  const pdfSrc = encodeURI(rawBase)
  activePdf = {src: pdfSrc, title, paperIndex, zoom:1}
  fileContent.innerHTML = `
    <div class="pdf-toolbar">
      <button id="pdfBackButton" type="button" class="btn small pdf-back-button">Back</button>
      <div class="pdf-controls">
        <button id="prevPaper" class="btn" type="button">Previous Paper</button>
        <button id="nextPaper" class="btn" type="button">Next Paper</button>
        <span class="path">${title}</span>
      </div>
      <div class="pdf-actions">
        <button id="zoomOut" class="btn" type="button" aria-label="Zoom out">-</button>
        <button id="zoomIn" class="btn" type="button" aria-label="Zoom in">+</button>
        <button id="fullScreenPdf" class="btn" type="button">Full Screen</button>
        <a class="btn" href="${pdfSrc}" download>Download</a>
      </div>
    </div>
    <div id="pdfViewerArea" class="pdf-viewer-area">
      <div id="pdfPages" class="pdf-pages"></div>
    </div>
    <p id="pdfFallbackMessage" class="pdf-fallback-message hidden">
      This browser cannot display the PDF inline. Use Download to save the file.
    </p>`
  wirePdfControls()
  setPdfViewing(true)
  window.requestAnimationFrame(() => {
    fileContent.scrollIntoView({behavior:'smooth', block:'start'})
  })

  try{
    await renderPdfToCanvas(pdfSrc)
  }catch(error){
    showPdfFallback()
  }
}

function wirePdfControls(){
  const papers = current.manifest?.[current.section] || []
  const prevPaper = el('prevPaper')
  const nextPaper = el('nextPaper')
  const zoomOut = el('zoomOut')
  const zoomIn = el('zoomIn')
  const fullScreen = el('fullScreenPdf')
  if(prevPaper) prevPaper.disabled = !activePdf || activePdf.paperIndex <= 0
  if(nextPaper) nextPaper.disabled = !activePdf || activePdf.paperIndex >= papers.length - 1

  // Paper navigation
  prevPaper?.removeEventListener?.('click', () => {})
  nextPaper?.removeEventListener?.('click', () => {})
  prevPaper?.addEventListener('click', () => openPaperAtIndex(activePdf.paperIndex - 1))
  nextPaper?.addEventListener('click', () => openPaperAtIndex(activePdf.paperIndex + 1))

  // Back button
  const backButton = el('pdfBackButton')
  backButton?.addEventListener?.('click', () => exitPdfView())

  // Zoom controls (single handlers)
  zoomOut?.addEventListener('click', () => {
    if(!activePdf) return
    const oldZoom = activePdf.zoom || 1
    activePdf.zoom = Math.max(0.7, Number((oldZoom - 0.15).toFixed(2)))
    console.debug('zoomOut clicked', {oldZoom, newZoom: activePdf.zoom})
    renderPdfToCanvas(activePdf.src).catch(() => showPdfFallback())
  })

  zoomIn?.addEventListener('click', () => {
    if(!activePdf) return
    const oldZoom = activePdf.zoom || 1
    activePdf.zoom = Math.min(1.8, Number((oldZoom + 0.15).toFixed(2)))
    console.debug('zoomIn clicked', {oldZoom, newZoom: activePdf.zoom})
    renderPdfToCanvas(activePdf.src).catch(() => showPdfFallback())
  })

  // Fullscreen toggle
  fullScreen?.addEventListener('click', async () => {
    const target = fileContent
    if(!document.fullscreenElement){
      await target.requestFullscreen()
      fullScreen.textContent = 'Exit Full Screen'
    } else {
      await document.exitFullscreen()
      fullScreen.textContent = 'Full Screen'
    }
  })
}

function openPaperAtIndex(index){
  const papers = current.manifest?.[current.section] || []
  const entry = papers[index]
  if(!entry) return

  const fileItems = fileList.querySelectorAll('.file-item')
  fileItems.forEach(item => item.classList.remove('active'))
  if(fileItems[index]) fileItems[index].classList.add('active')

  loadPdf(`./subjects/${current.subject.name}/${entry.file}`, entry.title, index)
}

function showPdfFallback(){
  const viewerArea = el('pdfViewerArea')
  const fallbackMessage = el('pdfFallbackMessage')
  if(viewerArea) viewerArea.classList.add('hidden')
  if(fallbackMessage) fallbackMessage.classList.remove('hidden')
}

function getPdfLibrary(){
  if(typeof window.pdfjsLib !== 'undefined') return window.pdfjsLib
  if(typeof globalThis.pdfjsLib !== 'undefined') return globalThis.pdfjsLib
  try{
    if(typeof pdfjsLib !== 'undefined') return pdfjsLib
  }catch(_){}
  return null
}

async function renderPdfToCanvas(pdfSrc){
  const token = ++pdfRenderToken
  const pdfLibrary = getPdfLibrary()
  if(!pdfLibrary) throw new Error('PDF renderer is not available')

  pdfLibrary.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js'

  const response = await fetch(pdfSrc)
  if(!response.ok) throw new Error('Failed to fetch PDF')

  const data = await response.arrayBuffer()
  const pdf = await pdfLibrary.getDocument({data}).promise
  const pages = el('pdfPages')
  const viewerArea = el('pdfViewerArea')
  if(!pages || !viewerArea) return
  pages.innerHTML = ''

  for(let pageNumber=1; pageNumber<=pdf.numPages; pageNumber++){
    if(token !== pdfRenderToken) return
    const page = await pdf.getPage(pageNumber)
    const baseViewport = page.getViewport({scale:1})
    const zoom = activePdf?.zoom || 1
    const maxPageWidth = window.matchMedia('(min-width: 1000px)').matches ? 820 : Infinity
    const fitWidth = Math.min(maxPageWidth, Math.max(240, viewerArea.clientWidth - 24))
    const availableWidth = fitWidth * zoom
    const scale = availableWidth / baseViewport.width
    const viewport = page.getViewport({scale})
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3)
    const pageWrap = document.createElement('section')
    pageWrap.className = 'pdf-page'
    pageWrap.setAttribute('aria-label', `Page ${pageNumber}`)
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width * pixelRatio)
    canvas.height = Math.floor(viewport.height * pixelRatio)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    pageWrap.appendChild(canvas)
    pages.appendChild(pageWrap)
    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0]
    }).promise
  }
}

window.addEventListener('resize', () => {
  if(!activePdf || !el('pdfViewerArea') || el('pdfViewerArea').classList.contains('hidden')) return
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    renderPdfToCanvas(activePdf.src).catch(() => {})
  }, 250)
})

document.addEventListener('fullscreenchange', () => {
  const fullScreen = el('fullScreenPdf')
  if(fullScreen) fullScreen.textContent = document.fullscreenElement ? 'Exit Full Screen' : 'Full Screen'
})

// Keyboard shortcuts for zooming when a PDF is active
document.addEventListener('keydown', (e) => {
  if(!activePdf) return
  // Don't trigger while typing in inputs
  const tag = document.activeElement?.tagName?.toLowerCase()
  if(tag === 'input' || tag === 'textarea') return
  if(e.key === '+' || e.key === '='){
    e.preventDefault()
    const oldZoom = activePdf.zoom || 1
    activePdf.zoom = Math.min(1.8, Number((oldZoom + 0.15).toFixed(2)))
    console.debug('keyboard zoomIn', {oldZoom, newZoom: activePdf.zoom})
    renderPdfToCanvas(activePdf.src).catch(() => showPdfFallback())
  } else if(e.key === '-'){
    e.preventDefault()
    const oldZoom = activePdf.zoom || 1
    activePdf.zoom = Math.max(0.7, Number((oldZoom - 0.15).toFixed(2)))
    console.debug('keyboard zoomOut', {oldZoom, newZoom: activePdf.zoom})
    renderPdfToCanvas(activePdf.src).catch(() => showPdfFallback())
  } else if(e.key === '0'){
    e.preventDefault()
    activePdf.zoom = 1
    console.debug('keyboard zoomReset')
    renderPdfToCanvas(activePdf.src).catch(() => showPdfFallback())
  }
})

window.openPDF = openPDF

backHome.addEventListener('click', ()=> showHome(true))

document.querySelectorAll('#sectionSelection .big').forEach(b=> b.addEventListener('click', async e=>{
  const section = e.currentTarget.dataset.section
  const count = await setSection(section)
  if(count>0){
    sectionSelection.classList.add('hidden')
    panelArea.classList.remove('hidden')
  }
}))

init().catch(e=> console.error(e))
