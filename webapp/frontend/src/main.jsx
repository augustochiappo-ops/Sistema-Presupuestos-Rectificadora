import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/styles.css'
import './styles/app.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { UndoProvider } from './context/UndoContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UndoProvider>
          <App />
        </UndoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
