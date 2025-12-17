// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
// ↓ このインポートが必要です
import { HashRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* ↓ Appを HashRouter で囲む必要があります */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)