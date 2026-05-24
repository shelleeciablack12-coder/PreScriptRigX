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

let current = {subject:null,section:null,manifest:null,searchTerm:'',paperType:null}
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
    current.paperType = null
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
  current = {subject:null,section:null,manifest:null,searchTerm:'',paperType:null}
  if(push) history.pushState({},'', '#')
}

async function setSection(section){
  current.section = section
  current.searchTerm = ''
  current.paperType = null
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
  const entries = getVisibleEntries()

  if(sectionKey === 'pastPapers' || sectionKey === 'pastPapersAnswers'){
    renderPaperTypePicker()
    if(!current.paperType){
      fileContent.innerHTML = `
        <div class="document-empty">
          <h3>Choose a paper</h3>
          <p>Select Paper 1 or Paper 2 to see available PDFs from newest to oldest.</p>
        </div>`
      return 1
    }
  }

  if(entries.length===0){
    const message = current.searchTerm ? 'No matching files found.' : 'No files in this section.'
    const msg = document.createElement('div')
    msg.className = 'file-item'
    msg.textContent = message
    fileList.appendChild(msg)
    if(!current.searchTerm) exitPdfView()
    fileContent.innerHTML = `<div class="document-empty"><h3>${message}</h3></div>`
    return 0
  }

  if(sectionKey === 'pastPapers' || sectionKey === 'pastPapersAnswers'){
    renderDocumentExplorer(entries)
    return entries.length
  }

  if(sectionKey === 'notes'){
    renderStudySourceExplorer(entries)
    return entries.length
  }

  const list = document.createElement('div')
  list.className = 'document-list'
  entries.forEach((e,index)=>{
    const node = document.createElement('button')
    node.type = 'button'
    node.className = 'file-item document-item'
    node.innerHTML = `
      <span class="document-title">${e.title}</span>
      <span class="document-meta">${e.year || 'Unknown year'}${e.type ? ' - ' + e.type : ''}</span>`
    node.addEventListener('click', ()=>{
      fileList.querySelectorAll('.file-item.active').forEach(item => item.classList.remove('active'))
      node.classList.add('active')
      const isPdf = (e.file || '').toLowerCase().endsWith('.pdf')
      if(isPdf) openPDF(current.subject.name, index)
      else loadFile(`subjects/${current.subject.name}/${e.file}`)
    })
    list.appendChild(node)
  })
  fileList.appendChild(list)
  fileContent.innerHTML = ''
  return entries.length
}

function renderStudySourceExplorer(entries){
  fileContent.innerHTML = `
    <div class="document-browser">
      <div class="document-browser-head">
        <div>
          <h3>Study Source</h3>
          <p>${entries.length} item${entries.length === 1 ? '' : 's'} available</p>
        </div>
      </div>
      <div class="document-card-grid"></div>
    </div>`

  const grid = fileContent.querySelector('.document-card-grid')
  entries.forEach((entry,index) => {
    const videoId = entry.videoId || '99VNC07y0Ek'
    const isPdf = (entry.file || '').toLowerCase().endsWith('.pdf')
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'document-card'
    const preview = isPdf
      ? `<span class="document-preview" data-preview="./subjects/${current.subject.name}/${entry.file}">
          <span class="document-preview-label">PDF</span>
        </span>`
      : `<span class="document-preview video-preview">
          <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" alt="" loading="lazy">
          <span class="play-badge">Play</span>
        </span>`
    card.innerHTML = `
      ${preview}
      <span class="document-card-body">
        <span class="document-card-title">${entry.title}</span>
        <span class="document-card-meta">${entry.type || 'Study Source'}</span>
      </span>`
    card.addEventListener('click', () => {
      if(isPdf) loadPdf(`./subjects/${current.subject.name}/${entry.file}`, entry.title, index)
      else loadFile(`subjects/${current.subject.name}/${entry.file}`)
    })
    grid.appendChild(card)
  })

  renderPdfCardPreviews()
}

function renderDocumentExplorer(entries){
  fileContent.innerHTML = `
    <div class="document-browser">
      <div class="document-browser-head">
        <div>
          <h3>${current.paperType === 'paper1' ? 'Paper 1' : 'Paper 2'}</h3>
          <p>${entries.length} PDF${entries.length === 1 ? '' : 's'} available, newest first</p>
        </div>
      </div>
      <div class="document-card-grid"></div>
    </div>`

  const grid = fileContent.querySelector('.document-card-grid')
  entries.forEach((entry,index) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'document-card'
    card.innerHTML = `
      <span class="document-preview" data-preview="./subjects/${current.subject.name}/${entry.file}">
        <span class="document-preview-label">PDF</span>
      </span>
      <span class="document-card-body">
        <span class="document-card-title">${formatDocumentTitle(entry)}</span>
        <span class="document-card-meta">${formatDocumentMeta(entry)}</span>
      </span>`
    card.addEventListener('click', () => openPDF(current.subject.name, index))
    grid.appendChild(card)
  })

  renderPdfCardPreviews()
}

function formatDocumentTitle(entry){
  const subjectName = current.subject?.name === 'Maths' ? 'Mathematics' : (current.subject?.name || 'Document').replaceAll('_',' ')
  return `${subjectName} ${entry.year || ''}`.trim()
}

function formatDocumentMeta(entry){
  const session = sessionLabel(entry)
  return [session, entry.type].filter(Boolean).join(' - ')
}

function sessionLabel(entry){
  const text = `${entry.title || ''} ${entry.file || ''}`.toLowerCase()
  if(text.includes('may-june')) return 'May-June'
  if(text.includes('jan')) return 'Jan'
  if(text.includes('may')) return 'May'
  return ''
}

function renderPdfCardPreviews(){
  const previews = [...document.querySelectorAll('.document-preview[data-preview]')]
  const pdfLibrary = getPdfLibrary()
  if(!pdfLibrary || previews.length === 0) return

  const renderPreview = async preview => {
    if(preview.dataset.rendered) return
    preview.dataset.rendered = 'true'
    try{
      pdfLibrary.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.js'
      const response = await fetch(encodeURI(preview.dataset.preview))
      if(!response.ok) throw new Error('Failed to fetch PDF')
      const data = await response.arrayBuffer()
      const pdf = await pdfLibrary.getDocument({data}).promise
      const page = await pdf.getPage(1)
      const baseViewport = page.getViewport({scale:1})
      const previewWidth = preview.clientWidth || 180
      const scale = previewWidth / baseViewport.width
      const viewport = page.getViewport({scale})
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width * pixelRatio)
      canvas.height = Math.floor(viewport.height * pixelRatio)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
        transform: pixelRatio === 1 ? null : [pixelRatio,0,0,pixelRatio,0,0]
      }).promise
      preview.innerHTML = ''
      preview.appendChild(canvas)
    }catch(_){
      preview.innerHTML = '<span class="document-preview-label">PDF</span>'
    }
  }

  if('IntersectionObserver' in window){
    const observer = new IntersectionObserver(items => {
      items.forEach(item => {
        if(item.isIntersecting){
          observer.unobserve(item.target)
          renderPreview(item.target)
        }
      })
    }, {root:fileContent, rootMargin:'160px'})
    previews.forEach(preview => observer.observe(preview))
  } else {
    previews.slice(0,12).forEach(renderPreview)
  }
}

function getVisibleEntries(){
  const sectionKey = current.section
  const entries = [...(current.manifest?.[sectionKey] || [])]
  const search = (current.searchTerm || '').toLowerCase()

  return entries
    .filter(e => !current.paperType || normalizePaperType(e.type || e.title || e.file) === current.paperType)
    .filter(e => {
      if(!search) return true
      const title = (e.title || '').toString().toLowerCase()
      const type = (e.type || e.file || '').toString().toLowerCase()
      const year = (e.year || '').toString().toLowerCase()
      return title.includes(search) || type.includes(search) || year.includes(search)
    })
    .sort(comparePapers)
}

function renderPaperTypePicker(){
  const picker = document.createElement('div')
  picker.className = 'paper-type-picker'
  ;['Paper 1','Paper 2'].forEach(label => {
    const value = normalizePaperType(label)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `paper-type-btn${current.paperType === value ? ' active' : ''}`
    button.textContent = label
    button.addEventListener('click', () => {
      current.paperType = value
      exitPdfView()
      renderFileList()
    })
    picker.appendChild(button)
  })
  fileList.appendChild(picker)
}

function normalizePaperType(value){
  const text = (value || '').toString().toLowerCase()
  if(text.includes('paper 1') || text.includes('paper1')) return 'paper1'
  if(text.includes('paper 2') || text.includes('paper2')) return 'paper2'
  return text.replace(/\s+/g,'')
}

function comparePapers(a,b){
  const yearDiff = (Number(b.year) || 0) - (Number(a.year) || 0)
  if(yearDiff) return yearDiff
  return sessionRank(b) - sessionRank(a)
}

function sessionRank(entry){
  const text = `${entry.title || ''} ${entry.file || ''}`.toLowerCase()
  if(text.includes('may-june') || text.includes('may')) return 2
  if(text.includes('jan')) return 1
  return 0
}

function openPDF(subject, paperIndex=null){
  const entries = getVisibleEntries()
  const entry = typeof paperIndex === 'number' && paperIndex >= 0 && paperIndex < entries.length
    ? entries[paperIndex]
    : null

  if(!entry){
    fileContent.innerHTML = `<p style="color:#f88">PDF not found for ${subject}.</p>`
    return
  }

  const pdfPath = `./subjects/${subject}/${entry.file}`
  loadPdf(pdfPath, entry.title, paperIndex)
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
  const papers = getVisibleEntries()
  const prevPaper = el('prevPaper')
  const nextPaper = el('nextPaper')
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
  backButton?.addEventListener?.('click', () => closePdfViewToList())

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

function closePdfViewToList(){
  activePdf = null
  setPdfViewing(false)
  renderFileList()
}

function openPaperAtIndex(index){
  const papers = getVisibleEntries()
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
