import { useState } from 'react'
import { useLocalStorage } from '../hooks/useApi'
import { setApiKey, clearApiKey } from '../services/api'
import { KeyIcon, TrashIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

interface ApiKeyEntry {
  service: string
  key: string
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useLocalStorage<ApiKeyEntry[]>('mangazap-api-keys', [])
  const [service, setService] = useState('mimo')
  const [key, setKey] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSave = async () => {
    if (!key.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      await setApiKey(service, key.trim(), apiBase.trim(), model.trim())
      const existing = apiKeys.findIndex((k) => k.service === service)
      if (existing >= 0) {
        const updated = [...apiKeys]
        updated[existing] = { service, key: key.trim() }
        setApiKeys(updated)
      } else {
        setApiKeys([...apiKeys, { service, key: key.trim() }])
      }
      setKey('')
      setApiBase('')
      setModel('')
      setMessage({ type: 'success', text: `API key for "${service}" saved` })
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to save: ${err}` })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (svc: string) => {
    try {
      await clearApiKey(svc)
      setApiKeys(apiKeys.filter((k) => k.service !== svc))
      setMessage({ type: 'success', text: `API key for "${svc}" removed` })
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to delete: ${err}` })
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Settings</h2>
        <p className="mt-1 text-sm text-gray-400">Manage your API keys</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-900/50 text-green-300 border border-green-700'
              : 'bg-red-900/50 text-red-300 border border-red-700'
          }`}
        >
          <CheckCircleIcon className="h-5 w-5" />
          {message.text}
        </div>
      )}

      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center gap-2">
          <KeyIcon className="h-5 w-5 text-indigo-400" />
          Add API Key
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Service</label>
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., mimo, openai"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">API Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="sk-..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">API Base URL <span className="text-gray-500">(optional)</span></label>
            <input
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://api.mimo.com/v1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Model Name <span className="text-gray-500">(optional)</span></label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="mimo-v2.5"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !key.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {saving ? 'Saving...' : 'Save Key'}
          </button>
        </div>
      </div>

      {apiKeys.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-4">Stored Keys</h3>
          <div className="space-y-3">
            {apiKeys.map((entry) => (
              <div
                key={entry.service}
                className="flex items-center justify-between bg-gray-800 rounded-md px-4 py-3"
              >
                <div>
                  <span className="font-medium text-gray-200">{entry.service}</span>
                  <span className="ml-3 text-sm text-gray-500 font-mono">
                    {'*'.repeat(8)}...{entry.key.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(entry.service)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-yellow-900/30 border border-yellow-700 rounded-md p-4">
        <p className="text-sm text-yellow-300">
          <strong>Security Note:</strong> Keys are stored in localStorage for convenience.
          On Windows, keys may persist in memory. Use WSL2 or Docker for production.
        </p>
      </div>
    </div>
  )
}
