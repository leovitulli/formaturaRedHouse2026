'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { sb } from '@/lib/util'

export default function Plaquinhas() {
  const [st, setSt] = useState(null)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) return (location.href = '/entrar')
      const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
      if (!adm) return setSt({ negado: true })
      const { data } = await sb.from('familias').select('id,formando_nome,resp1_nome,resp1_parentesco,resp2_nome,resp2_parentesco').order('formando_nome')
      const fams = await Promise.all((data || []).map(async (f, i) => ({ ...f, n: i + 1, qr: await QRCode.toDataURL('FORMATURA:' + f.id, { width: 220, margin: 1 }) })))
      setSt({ fams })
    })()
  }, [])

  if (!st) return <main><p className="mut">Carregando…</p></main>
  if (st.negado) return <main><h1>Acesso restrito</h1></main>

  return (
    <main>
      <style>{`
        .folha{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
        .placa{background:#fff;color:#111;border:2px dashed #999;border-radius:6px;padding:14px 16px;display:grid;grid-template-columns:1fr auto;gap:10px;align-content:start;min-width:0}
        .placa .num{font-size:12px;font-weight:700;color:#555;letter-spacing:.5px}
        .placa .nome{font-size:26px;font-weight:800;line-height:1.1;margin:6px 0 10px;overflow-wrap:anywhere}
        .placa .pais{font-size:14px;line-height:1.5}
        .placa .pais span{color:#555}
        .placa img{width:90px;height:90px}
        .placa .rod{grid-column:1/-1;font-size:10px;color:#777;border-top:1px solid #ddd;padding-top:6px;align-self:end}
        @media print{
          @page{size:A4 portrait;margin:8mm}
          .topo,.noprint{display:none!important}
          body{background:#fff}
          main{padding:0!important;max-width:none!important;display:block!important}
          .folha{display:flex!important;flex-wrap:wrap;gap:0;break-after:page;page-break-after:always}
          .folha:last-child{break-after:auto;page-break-after:auto}
          .placa{border-radius:0;border:1px dashed #999;width:50%;height:54mm;overflow:hidden;padding:5mm 6mm;grid-template-rows:auto 1fr auto;box-sizing:border-box;break-inside:avoid}
          .placa .num{font-size:7pt}
          .placa .nome{font-size:17pt;margin:3px 0 6px}
          .placa .pais{font-size:9.5pt;line-height:1.4}
          .placa img{width:24mm;height:24mm}
          .placa .rod{font-size:6.5pt;padding-top:3px}
        }`}</style>

      <div className="row noprint" style={{ justifyContent: 'space-between' }}>
        <h1>Plaquinhas da sessão de fotos</h1>
        <div className="row">
          <button className="p" onClick={() => window.print()}>Imprimir</button>
          <a className="btn" href="/admin">Voltar</a>
        </div>
      </div>

      <section className="box leg noprint">
        <h2 style={{ color: 'var(--fg)' }}>Como usar</h2>
        <div><b>Imprima</b>: 10 plaquinhas por folha A4 (em pé), no tamanho que aparece aqui na tela, em ordem alfabética do formando. Recorte na linha tracejada. A lista vem dos cadastros; imprima perto do evento para incluir todo mundo.</div>
        <div><b>Na sessão de fotos</b>: antes de fotografar cada família, faça uma foto da plaquinha. Tudo o que vier depois dela, até a próxima plaquinha, é daquela família.</div>
        <div><b>Número</b>: ordem de chamada na sessão. <b>QR Code</b>: identifica a família no sistema; serve para a separação automática das fotos no futuro.</div>
        <div>{st.fams.length} famílias cadastradas.</div>
      </section>

      {!st.fams.length && <p className="mut">Nenhuma família cadastrada ainda.</p>}
      {Array.from({ length: Math.ceil(st.fams.length / 10) }, (_, i) => st.fams.slice(i * 10, i * 10 + 10)).map((grupo, gi) => (
        <div className="folha" key={gi}>{grupo.map(f => (
        <div className="placa" key={f.id}>
          <div style={{ minWidth: 0 }}>
            <div className="num">Nº {String(f.n).padStart(2, '0')} · FORMATURA RED HOUSE 2026</div>
            <div className="nome">{f.formando_nome}</div>
            <div className="pais">
              <div><span>{f.resp1_parentesco}:</span> {f.resp1_nome}</div>
              {f.resp2_nome && <div><span>{f.resp2_parentesco}:</span> {f.resp2_nome}</div>}
            </div>
          </div>
          <img src={f.qr} alt={'QR de ' + f.formando_nome} />
          <div className="rod">Léo Vitulli · Fotógrafo e Videomaker · Sessão de fotos com a família</div>
        </div>
        ))}</div>
      ))}
    </main>
  )
}
