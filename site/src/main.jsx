import { createRoot } from 'react-dom/client'
import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource/dm-mono/400.css'
import './estilos.css'
import App from './App.jsx'

// sem StrictMode: a cena 3D é criada uma vez só (o modo estrito montaria dois renderizadores no mesmo canvas)
createRoot(document.getElementById('raiz')).render(<App />)
