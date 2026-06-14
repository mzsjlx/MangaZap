import { useState, useRef, useCallback } from 'react'
import {
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { listTemplates, deleteTemplate } from '../services/api'
import { useApi } from '../hooks/useApi'

interface ImportResult {
  template: {
    id: string
    name: string
    author: string
    is_official: boolean
  }
  signature_valid: boolean
  checksum_valid: boolean
  is_official: boolean
  warning: boolean
}

interface PendingImport {
  file: File
  sigFile: File | null
  result: ImportResult
}

const TRUSTED_KEY = 'mangazap-trusted-templates'

function getTrustedTemplates(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TRUSTED_KEY) || '[]')
  } catch {
    return []
  }
}

function addTrustedTemplate(id: string): void {
  const trusted = getTrustedTemplates()
  if (!trusted.includes(id)) {
    trusted.push(id)
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(trusted))
  }
}

export default function TemplatesPage() {
  const { data, loading, refetch } = useApi(() => listTemplates())
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sigInputRef = useRef<HTMLInputElement>(null)

  const templates = data?.templates || []

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const sigFile = sigInputRef.current?.files?.[0]
      if (sigFile) {
        formData.append('sig_file', sigFile)
      }

      const response = await fetch('/api/templates/import', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Import failed: ${response.status}`)
      }

      const result: ImportResult = await response.json()

      if (result.warning && !getTrustedTemplates().includes(result.template.id)) {
        setPendingImport({ file, sigFile: sigFile || null, result })
      } else {
        setMessage({ type: 'success', text: `Template "${result.template.name}" imported` })
        refetch()
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Import failed: ${err}` })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (sigInputRef.current) sigInputRef.current.value = ''
    }
  }

  const handleTrust = useCallback(() => {
    if (!pendingImport) return
    addTrustedTemplate(pendingImport.result.template.id)
    setMessage({ type: 'success', text: `Template "${pendingImport.result.template.name}" trusted and imported` })
    setPendingImport(null)
    refetch()
  }, [pendingImport, refetch])

  const handleContinueAnyway = useCallback(() => {
    if (!pendingImport) return
    setMessage({ type: 'success', text: `Template "${pendingImport.result.template.name}" imported (untrusted)` })
    setPendingImport(null)
    refetch()
  }, [pendingImport, refetch])

  const handleCancelImport = useCallback(() => {
    setPendingImport(null)
    setMessage({ type: 'error', text: 'Import cancelled' })
  }, [])

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteTemplate(id)
      setMessage({ type: 'success', text: `Template "${name}" deleted` })
      refetch()
    } catch (err) {
      setMessage({ type: 'error', text: `Delete failed: ${err}` })
    }
  }

  const handleExport = (id: string) => {
    window.open(`/api/templates/export/${id}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Templates</h2>
          <p className="mt-1 text-sm text-gray-400">
            Import and export .flova template files
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            <ArrowUpTrayIcon className="h-5 w-5" />
            {importing ? 'Importing...' : 'Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".flova"
            onChange={handleFileSelected}
            className="hidden"
          />
          <input
            ref={sigInputRef}
            type="file"
            accept=".sig"
            className="hidden"
          />
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-900/50 text-green-300 border border-green-700'
              : 'bg-red-900/50 text-red-300 border border-red-700'
          }`}
        >
          <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
          {message.text}
        </div>
      )}

      {pendingImport && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-yellow-300 font-semibold mb-2">Signature Verification Failed</h3>
              <div className="text-sm text-yellow-200/80 space-y-1 mb-4">
                <p>Template: <strong>{pendingImport.result.template.name}</strong></p>
                <p>Author: {pendingImport.result.template.author}</p>
                <p>
                  Signature:{' '}
                  <span className={pendingImport.result.signature_valid ? 'text-green-400' : 'text-red-400'}>
                    {pendingImport.result.signature_valid ? 'Valid' : 'Invalid'}
                  </span>
                </p>
                <p>
                  Checksum:{' '}
                  <span className={pendingImport.result.checksum_valid ? 'text-green-400' : 'text-red-400'}>
                    {pendingImport.result.checksum_valid ? 'Valid' : 'Invalid'}
                  </span>
                </p>
              </div>
              <p className="text-xs text-yellow-300/60 mb-4">
                This template claims to be official but the signature could not be verified.
                The file may have been tampered with or downloaded from an untrusted source.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTrust}
                  className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
                >
                  <ShieldCheckIcon className="h-4 w-4" />
                  Trust this template
                </button>
                <button
                  onClick={handleContinueAnyway}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium py-2 px-4 rounded-md transition-colors text-sm"
                >
                  Continue anyway
                </button>
                <button
                  onClick={handleCancelImport}
                  className="text-gray-400 hover:text-gray-200 font-medium py-2 px-4 rounded-md transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-md p-4">
        <p className="text-sm text-yellow-300/80">
          <strong>Note:</strong> Template signatures are toy-level, used only for marking
          source (official/community). Integrity relies on HTTPS transport.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <ArrowUpTrayIcon className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No templates</p>
          <p className="text-sm text-gray-500 mt-1">Import a .flova file to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-gray-900 rounded-lg border border-gray-800 p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-gray-200">{template.name}</h3>
                  <p className="text-xs text-gray-500 mt-1">by {template.author}</p>
                </div>
                <div className="flex items-center gap-2">
                  {template.is_official && (
                    <span className="text-xs bg-indigo-600 text-indigo-100 px-2 py-0.5 rounded-full">
                      Official
                    </span>
                  )}
                  {template.imported && !template.signature_valid && (
                    <span className="text-xs bg-yellow-600/50 text-yellow-200 px-2 py-0.5 rounded-full">
                      Unverified
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                {template.description || 'No description'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport(template.id)}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Export
                </button>
                <button
                  onClick={() => handleDelete(template.id, template.name)}
                  className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300 transition-colors ml-auto"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
