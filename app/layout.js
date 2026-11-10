import './globals.css'
export const metadata = { title: 'Formatura Red House · Léo Vitulli' }
export default function Layout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="topo"><div><b>LÉO VITULLI</b><span>Fotógrafo · Video Maker · Formatura Red House 2026</span></div></header>
        {children}
      </body>
    </html>
  )
}
