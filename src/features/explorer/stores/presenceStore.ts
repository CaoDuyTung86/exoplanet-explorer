import { create } from 'zustand'
import { wsUrl } from '../services/http'

export interface Peer {
  id: string
  name: string
  color: string
  authenticated: boolean
  planetId: string | null
  since: number
}

type Status = 'idle' | 'connecting' | 'live' | 'offline'

interface PresenceState {
  status: Status
  /** Our own peer, once the server has told us who it decided we are. */
  self: Peer | null
  /** Everyone in the room, us included. Keyed by id so events apply idempotently. */
  peers: Record<string, Peer>
  /** Which fan-out the server is running — useful to see Redis is actually wired up. */
  backend: string | null

  connect: () => void
  disconnect: () => void
  /** Tell the room which planet this visitor is looking at. */
  setFocus: (planetId: string | null) => void
}

/**
 * Presence over one WebSocket.
 *
 * The socket, its timers and its retry counter live outside the store: they are not
 * rendered, and putting them in state would re-render the header on every heartbeat.
 */
let socket: WebSocket | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null
let reconnect: ReturnType<typeof setTimeout> | null = null
let attempts = 0
let deliberateClose = false
let lastFocus: string | null = null

function clearTimers() {
  if (heartbeat !== null) clearInterval(heartbeat)
  if (reconnect !== null) clearTimeout(reconnect)
  heartbeat = null
  reconnect = null
}

function send(message: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  status: 'idle',
  self: null,
  peers: {},
  backend: null,

  connect: () => {
    if (socket !== null || get().status === 'connecting') return

    deliberateClose = false
    set({ status: 'connecting' })

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl('/v1/ws/presence'))
    } catch {
      set({ status: 'offline' })
      return
    }
    socket = ws

    // React remounts effects in development, and a reconnect can overlap a closing
    // socket. Every handler therefore ignores events from a socket that is no longer
    // the current one — otherwise the old socket's onclose nulls out the new one and
    // schedules a retry that opens a second connection.
    const isCurrent = () => socket === ws

    ws.onopen = () => {
      if (!isCurrent()) return
      attempts = 0
    }

    ws.onmessage = (event) => {
      if (!isCurrent()) return
      let message: Record<string, unknown>
      try {
        message = JSON.parse(event.data as string)
      } catch {
        return
      }

      switch (message.type) {
        case 'welcome': {
          const self = message.you as Peer
          const list = (message.peers as Peer[]) ?? []
          const peers: Record<string, Peer> = {}
          for (const peer of list) peers[peer.id] = peer

          set({
            status: 'live',
            self,
            peers,
            backend: (message.backend as string) ?? null,
          })

          // The server decides the heartbeat interval from its own TTL, so the client
          // cannot drift out of step with it after a config change.
          const seconds = Math.max(5, (message.heartbeatSeconds as number) ?? 15)
          clearTimers()
          heartbeat = setInterval(() => send({ type: 'ping' }), seconds * 1000)

          // A reconnect gets a brand new peer id, so whatever we were looking at has to
          // be re-announced or the room shows us staring at nothing.
          if (lastFocus !== null) send({ type: 'focus', planetId: lastFocus })
          break
        }

        case 'join':
        case 'update': {
          const peer = message.peer as Peer
          set((state) => ({ peers: { ...state.peers, [peer.id]: peer } }))
          break
        }

        case 'leave': {
          const id = message.peerId as string
          set((state) => {
            const next = { ...state.peers }
            delete next[id]
            return { peers: next }
          })
          break
        }

        case 'error': {
          // The only one the server sends today is a full room.
          set({ status: 'offline' })
          break
        }
      }
    }

    ws.onclose = () => {
      if (!isCurrent()) return
      socket = null
      clearTimers()
      set({ status: deliberateClose ? 'idle' : 'offline', self: null, peers: {} })
      if (deliberateClose) return

      // Exponential backoff, capped, so a restarting API is not hammered by every open
      // tab at once. Presence is a nicety; it can afford to come back slowly.
      attempts += 1
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5))
      reconnect = setTimeout(() => get().connect(), delay)
    }

    ws.onerror = () => {
      // onclose always follows, and that is where the retry lives.
    }
  },

  disconnect: () => {
    deliberateClose = true
    clearTimers()

    // Drop our claim on the socket before closing it, so its onclose sees that it is no
    // longer current and stays out of the way of whatever connects next.
    const closing = socket
    socket = null

    if (closing !== null) {
      if (closing.readyState === WebSocket.CONNECTING) {
        // Closing a socket mid-handshake makes the browser log "closed before the
        // connection is established", which reads like a presence failure when it is
        // just React remounting the effect. Let it finish, then close it quietly.
        closing.onopen = () => closing.close()
      } else {
        closing.close()
      }
    }

    set({ status: 'idle', self: null, peers: {}, backend: null })
  },

  setFocus: (planetId) => {
    if (lastFocus === planetId) return
    lastFocus = planetId
    send({ type: 'focus', planetId })
  },
}))
