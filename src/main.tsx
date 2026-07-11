import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Vercel serves the same deployment under several aliases, but the Spotify
// redirect URI must match byte-for-byte — funnel every alias to the canonical
// host before auth ever starts.
const CANONICAL_HOST = 'maestro-lemon.vercel.app'
if (window.location.hostname.endsWith('.vercel.app') && window.location.hostname !== CANONICAL_HOST) {
  window.location.replace(`https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}`)
}

createRoot(document.getElementById('root')!).render(<App />)
