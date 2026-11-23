import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { Readable } from 'node:stream'
import { FILE_SCHEME } from '../shared/fileUrl'
import { mimeForPath } from '../shared/fileTypes'

function corsHeaders(): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers':
      'Content-Range, Content-Length, Accept-Ranges',
    'Cache-Control': 'no-store'
  })
}

function errorResponse(message: string, status: number): Response {
  const headers = corsHeaders()
  headers.set('Content-Type', 'text/plain; charset=utf-8')
  return new Response(message, { status, headers })
}

export function registerFileProtocol(): void {
  protocol.handle(FILE_SCHEME, async (request) => {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() })
      }

      const url = new URL(request.url)
      if (url.hostname !== 'local') {
        return errorResponse('Unbekannter Dateizugriff.', 404)
      }
      const encoded = url.pathname.replace(/^\/+/, '')
      if (!encoded) return errorResponse('Pfad fehlt.', 400)
      const filePath = decodeURIComponent(encoded)
      if (!filePath || filePath.includes('\u0000') || !isAbsolute(filePath)) {
        return errorResponse('Ungültiger Pfad.', 400)
      }

      const info = await stat(filePath)
      if (!info.isFile()) {
        return errorResponse('Keine Datei.', 404)
      }

      const headers = corsHeaders()
      headers.set('Content-Type', mimeForPath(filePath))
      headers.set('Accept-Ranges', 'bytes')
      headers.set('Last-Modified', info.mtime.toUTCString())

      const range = request.headers.get('Range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
        if (!match) {
          const invalid = corsHeaders()
          invalid.set('Content-Range', `bytes */${info.size}`)
          return new Response('Ungültiger Bereich.', {
            status: 416,
            headers: invalid
          })
        }
        let start = match[1] ? Number(match[1]) : 0
        let end = match[2] ? Number(match[2]) : info.size - 1
        if (match[1] === '' && match[2]) {
          start = Math.max(0, info.size - Number(match[2]))
          end = info.size - 1
        }
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end < start ||
          start >= info.size
        ) {
          const invalid = corsHeaders()
          invalid.set('Content-Range', `bytes */${info.size}`)
          return new Response('Ungültiger Bereich.', {
            status: 416,
            headers: invalid
          })
        }
        end = Math.min(end, info.size - 1)
        headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`)
        headers.set('Content-Length', String(end - start + 1))
        const stream = Readable.toWeb(
          createReadStream(filePath, { start, end })
        ) as unknown as ReadableStream<Uint8Array>
        return new Response(stream, { status: 206, headers })
      }

      headers.set('Content-Length', String(info.size))
      const stream = Readable.toWeb(
        createReadStream(filePath)
      ) as unknown as ReadableStream<Uint8Array>
      return new Response(stream, { status: 200, headers })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Datei nicht lesbar.'
      return errorResponse(message, 404)
    }
  })
}
