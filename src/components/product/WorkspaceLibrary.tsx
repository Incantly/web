'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AppIcon } from './AppIcon'

type Folder = { id: string; name: string; parentId: string | null; createdAt: number }
type Asset = { id: string; name: string; type: string; size: number; folderId: string | null; createdAt: number; blob: Blob }

const DATABASE_NAME = 'incantly-library'
const DATABASE_VERSION = 1

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('folders')) database.createObjectStore('folders', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('assets')) database.createObjectStore('assets', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readAll<T>(database: IDBDatabase, storeName: 'folders' | 'assets'): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly')
    const request = transaction.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

function saveItem(database: IDBDatabase, storeName: 'folders' | 'assets', value: Folder | Asset): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(value)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileKind(type: string, name: string) {
  if (type.includes('pdf') || name.toLowerCase().endsWith('.pdf')) return 'PDF'
  if (type.startsWith('audio/')) return 'Audio'
  if (type.startsWith('video/')) return 'Video'
  if (type.startsWith('image/')) return 'Image'
  if (/\.(xlsx?|csv)$/i.test(name)) return 'Spreadsheet'
  return 'File'
}

export function WorkspaceLibrary() {
  const [database, setDatabase] = useState<IDBDatabase | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showFolderForm, setShowFolderForm] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    let connection: IDBDatabase | null = null
    openLibrary().then(async (db) => {
      connection = db
      const [nextFolders, nextAssets] = await Promise.all([
        readAll<Folder>(db, 'folders'),
        readAll<Asset>(db, 'assets'),
      ])
      if (live) {
        setDatabase(db)
        setFolders(nextFolders)
        setAssets(nextAssets)
      } else db.close()
    }).catch(() => { if (live) setError('This browser could not open local file storage.') })
    return () => { live = false; connection?.close() }
  }, [])

  const currentFolder = folders.find((folder) => folder.id === folderId)
  const visibleFolders = useMemo(() => folders.filter((folder) => folder.parentId === folderId).sort((a, b) => a.name.localeCompare(b.name)), [folders, folderId])
  const visibleAssets = useMemo(() => assets.filter((asset) => asset.folderId === folderId).sort((a, b) => b.createdAt - a.createdAt), [assets, folderId])
  const breadcrumbs: Folder[] = []
  let ancestor = currentFolder
  while (ancestor) {
    breadcrumbs.unshift(ancestor)
    ancestor = folders.find((folder) => folder.id === ancestor?.parentId)
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name || !database) return
    const folder: Folder = { id: crypto.randomUUID(), name, parentId: folderId, createdAt: Date.now() }
    try {
      await saveItem(database, 'folders', folder)
      setFolders((current) => [...current, folder])
      setNewFolderName('')
      setShowFolderForm(false)
      setError('')
    } catch { setError('The folder could not be saved. Please try again.') }
  }

  async function renameFolder() {
    const folder = folders.find((item) => item.id === renamingId)
    const name = renameValue.trim()
    if (!folder || !name || !database) return
    const updated = { ...folder, name }
    try {
      await saveItem(database, 'folders', updated)
      setFolders((current) => current.map((item) => item.id === folder.id ? updated : item))
      setRenamingId(null)
      setError('')
    } catch { setError('The folder could not be renamed.') }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!database || files.length === 0) return
    try {
      const uploaded = await Promise.all(Array.from(files).map(async (file) => {
        const asset: Asset = { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, folderId, createdAt: Date.now(), blob: file }
        await saveItem(database, 'assets', asset)
        return asset
      }))
      setAssets((current) => [...uploaded, ...current])
      setError('')
    } catch { setError('One or more files could not be saved. Check your browser storage and try again.') }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void uploadFiles(event.target.files)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
    void uploadFiles(event.dataTransfer.files)
  }

  function openAsset(asset: Asset) {
    const url = URL.createObjectURL(asset.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = asset.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  return (
    <div className="mx-auto w-full max-w-[78rem] px-5 py-7 sm:px-8 lg:px-12 lg:py-10">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-button">Your library</p>
          <h1 className="mt-2 font-display text-[clamp(2.45rem,5vw,4rem)] font-normal leading-none tracking-[-0.055em] text-foreground">A place for everything you find.</h1>
          <p className="mt-3 max-w-[38rem] text-sm leading-6 text-muted">Keep research files together in folders you name. Add PDFs, audio, spreadsheets, images, and anything else that helps you think.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowFolderForm(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-default bg-raised px-4 text-sm font-medium text-foreground hover:border-button"><AppIcon name="plus" className="size-4" /> New folder</button>
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-button px-4 text-sm font-semibold text-inverse hover:bg-button-hover"><AppIcon name="plus" className="size-4" /> Add files</button>
        </div>
      </header>
      <input ref={fileInput} type="file" multiple className="sr-only" onChange={onFileChange} aria-label="Upload files to this folder" />
      <nav className="mt-9 flex min-h-11 flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
        <button type="button" onClick={() => setFolderId(null)} className="min-h-11 rounded-lg px-2 font-medium text-button hover:bg-surface">Library</button>
        {breadcrumbs.map((folder) => <span key={folder.id} className="flex items-center gap-1"><AppIcon name="chevron" className="size-4 text-subtle" /><button type="button" onClick={() => setFolderId(folder.id)} className="min-h-11 rounded-lg px-2 font-medium text-foreground hover:bg-surface">{folder.name}</button></span>)}
      </nav>
      {showFolderForm ? <form onSubmit={(event) => { event.preventDefault(); void createFolder() }} className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-button bg-surface p-3"><AppIcon name="archive" className="size-5 text-button" /><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Folder name" aria-label="Folder name" className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none" /><button type="submit" className="min-h-11 rounded-lg bg-button px-4 text-sm font-semibold text-inverse">Create</button><button type="button" onClick={() => setShowFolderForm(false)} className="min-h-11 rounded-lg px-3 text-sm text-muted">Cancel</button></form> : null}
      {error ? <p role="alert" className="mt-4 text-sm text-button">{error}</p> : null}
      <section onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} className={`mt-5 min-h-[23rem] rounded-[1.15rem] border p-4 sm:p-6 ${isDragging ? 'border-button bg-surface' : 'border-default bg-raised'}`} aria-label={currentFolder ? `${currentFolder.name} files` : 'Library files'}>
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-default pb-4"><h2 className="font-display text-[1.5rem] font-normal text-foreground">{currentFolder?.name ?? 'All folders'}</h2><span className="text-xs text-subtle">{visibleFolders.length} folders · {visibleAssets.length} files</span></div>
        {visibleFolders.length || visibleAssets.length ? <div className="grid gap-2">
          {visibleFolders.map((folder) => <div key={folder.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-default px-3 hover:border-button"><button type="button" onClick={() => setFolderId(folder.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-button"><AppIcon name="archive" className="size-5" /></span><span className="min-w-0 truncate text-sm font-medium text-foreground">{folder.name}</span><AppIcon name="chevron" className="ml-auto size-4 shrink-0 text-subtle" /></button><button type="button" onClick={() => { setRenamingId(folder.id); setRenameValue(folder.name) }} className="min-h-11 rounded-lg px-2 text-xs text-muted hover:text-button">Rename</button></div>)}
          {visibleAssets.map((asset) => <button key={asset.id} type="button" onClick={() => openAsset(asset)} className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-default px-3 text-left hover:border-button"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-button"><AppIcon name="document" className="size-5" /></span><span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{asset.name}</span><span className="hidden shrink-0 text-xs text-subtle sm:block">{fileKind(asset.type, asset.name)}</span><span className="shrink-0 text-xs text-subtle">{sizeLabel(asset.size)}</span></button>)}
        </div> : <div className="grid min-h-[16rem] place-content-center justify-items-center text-center"><span className="grid size-14 place-items-center rounded-2xl bg-surface text-button"><AppIcon name="archive" className="size-7" /></span><p className="mt-4 font-display text-xl text-foreground">Your research can start here.</p><p className="mt-2 max-w-[20rem] text-sm leading-6 text-muted">Create a folder for a topic, or drop files anywhere in this space.</p></div>}
      </section>
      {renamingId ? <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4" role="presentation"><form onSubmit={(event) => { event.preventDefault(); void renameFolder() }} className="w-full max-w-sm rounded-2xl border border-default bg-raised p-6" aria-label="Rename folder"><h2 className="font-display text-2xl text-foreground">Rename folder</h2><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} aria-label="New folder name" className="mt-5 min-h-11 w-full rounded-lg border border-default px-3 text-foreground outline-none focus:border-button" /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRenamingId(null)} className="min-h-11 px-4 text-muted">Cancel</button><button type="submit" className="min-h-11 rounded-lg bg-button px-4 font-medium text-inverse">Save</button></div></form></div> : null}
    </div>
  )
}
