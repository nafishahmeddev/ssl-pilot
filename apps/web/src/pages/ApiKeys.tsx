import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listApiKeysApi, createApiKeyApi, deleteApiKeyApi } from '../api/apikeys'
import { getApiError } from '../api/errors'
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Terminal,
  ShieldCheck,
  X,
} from 'lucide-react'

export default function ApiKeys() {
  const qc = useQueryClient()

  const [showCreate, setShowCreate]     = useState(false)
  const [newKeyName, setNewKeyName]     = useState('')
  const [revealedKey, setRevealedKey]   = useState<string | null>(null)
  const [copiedKey, setCopiedKey]       = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['api-keys'],
    queryFn: listApiKeysApi,
  })
  const keys = data?.data.keys ?? []

  const createMutation = useMutation({
    mutationFn: (name: string) => createApiKeyApi(name),
    onSuccess: (res) => {
      setRevealedKey(res.data.key)
      setShowCreate(false)
      setNewKeyName('')
      qc.invalidateQueries({ queryKey: ['api-keys'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteApiKeyApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) return
    createMutation.mutate(newKeyName.trim())
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

  const fmtRelative = (iso?: string) => {
    if (!iso) return 'Never'
    return fmtDate(iso)
  }

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-4xl w-full mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="pt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>API Keys</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Keys for the CLI tool and server automation
          </p>
        </div>
        {!revealedKey && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New Key
          </button>
        )}
      </div>

      {/* ── One-time key reveal ── */}
      {revealedKey && (
        <div
          className="rounded-2xl p-6"
          style={{ background: 'var(--c-card)', border: '1px solid oklch(62% 0.18 158 / 0.4)' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-success-soft)' }}>
              <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>API Key Created</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--c-error)' }}>
                Copy this key now — it will <strong>never be shown again</strong>.
              </p>
            </div>
          </div>

          <div
            className="rounded-xl p-4 flex items-center gap-3 font-mono text-sm mb-4"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
          >
            <span className="flex-1 break-all" style={{ color: 'var(--c-primary)' }}>{revealedKey}</span>
            <button
              onClick={() => handleCopy(revealedKey)}
              className="btn btn-ghost btn-sm gap-1.5 shrink-0"
            >
              {copiedKey
                ? <><Check className="w-4 h-4 text-success" /> Copied</>
                : <><Copy className="w-4 h-4" /> Copy</>}
            </button>
          </div>

          <div
            className="rounded-xl px-4 py-3 mb-4 text-xs space-y-1.5"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
          >
            <p className="font-semibold mb-2" style={{ color: 'var(--c-text-1)' }}>Usage:</p>
            <p>
              <span className="font-mono" style={{ color: 'var(--c-text-3)' }}>export SSL_PILOT_API_KEY=</span>
              <span className="font-mono" style={{ color: 'var(--c-primary)' }}>{revealedKey}</span>
            </p>
            <p className="font-mono" style={{ color: 'var(--c-text-3)' }}>ssl-pilot list</p>
            <p className="font-mono" style={{ color: 'var(--c-text-3)' }}>sudo ssl-pilot download</p>
          </div>

          <button
            onClick={() => { setRevealedKey(null); setCopiedKey(false) }}
            className="btn btn-sm gap-2"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
          >
            <Check className="w-4 h-4" /> I've saved the key
          </button>
        </div>
      )}

      {/* ── Create form (inline card) ── */}
      {showCreate && !revealedKey && (
        <div className="rounded-2xl p-6" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>New API Key</h2>
            <button onClick={() => { setShowCreate(false); setNewKeyName(''); createMutation.reset() }} className="btn btn-ghost btn-sm btn-square">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-4 max-w-sm">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--c-text-3)' }}>
                Key Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                className="input input-bordered w-full"
                placeholder="e.g. Production Server, Deploy Bot"
                maxLength={64}
                autoFocus
              />
              <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>
                Give it a name so you know which server or script uses it.
              </p>
            </div>

            {createMutation.isError && (
              <div className="alert alert-error text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(createMutation.error, 'Failed to create key.')}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewKeyName(''); createMutation.reset() }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newKeyName.trim() || createMutation.isPending}
                className="btn btn-primary btn-sm gap-2"
              >
                {createMutation.isPending && <span className="loading loading-spinner loading-xs" />}
                Generate Key
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Error ── */}
      {isError && (
        <div className="alert alert-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load API keys.</span>
        </div>
      )}

      {/* ── Key list ── */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md" style={{ color: 'var(--c-primary)' }} />
        </div>
      ) : keys.length === 0 && !showCreate && !revealedKey ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : keys.length > 0 ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
            {keys.length} {keys.length === 1 ? 'key' : 'keys'}
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
            {keys.map((k) => (
              <div key={k._id} className="flex items-center gap-4 px-5 py-4">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'var(--c-primary-soft)' }}
                >
                  <Key className="w-4 h-4" style={{ color: 'var(--c-primary)' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>{k.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      Created {fmtDate(k.createdAt)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      Last used: {fmtRelative(k.lastUsedAt)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (window.confirm(`Revoke API key "${k.name}"? Any scripts using it will stop working.`)) {
                      deleteMutation.mutate(k._id)
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="btn btn-ghost btn-sm btn-square"
                  title="Revoke key"
                >
                  <Trash2 className="w-4 h-4" style={{ color: 'var(--c-error)' }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

    </main>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
        style={{ background: 'var(--c-primary-soft)', border: '1px solid var(--c-primary-mid)' }}
      >
        <Terminal className="w-7 h-7" style={{ color: 'var(--c-primary)' }} />
      </div>
      <h2 className="text-base font-bold mb-1" style={{ color: 'var(--c-text-1)' }}>No API keys yet</h2>
      <p className="text-sm mb-1" style={{ color: 'var(--c-text-2)' }}>
        API keys let the CLI tool and server scripts download certificates automatically.
      </p>
      <p className="text-xs mb-6" style={{ color: 'var(--c-text-3)' }}>
        Each key is scoped to your organisation. Revoke any key at any time.
      </p>
      <button onClick={onCreate} className="btn btn-primary gap-2">
        <Plus className="w-4 h-4" /> Create first key
      </button>
    </div>
  )
}
