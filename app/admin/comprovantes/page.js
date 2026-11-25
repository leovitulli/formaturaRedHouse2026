'use client'
import { useEffect, useRef, useState } from 'react'
import { sb, brl, data, compararComprovantes } from '@/lib/util'

async function abrir(path) {
  const { data: d } = await sb.storage.from('comprovantes').createSignedUrl(path, 600)
  if (d) window.open(d.signedUrl, '_blank')
}

export default function RelatorioComprovantes() {
  const [st, setSt] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [editId, setEditId] = useState(null)
  const [editNome, setEditNome] = useState('')
  const [compInfo, setCompInfo] = useState({ mapa: new Map(), repetidos: new Set() })
  const hashCache = useRef(new Map())

  async function carregar() {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return (location.href = '/entrar')
    const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
    if (!adm) return setSt({ negado: true })
    const [{ data: pags }, { data: fams }] = await Promise.all([
      sb.from('pagamentos').select('*').order('criado_em', { ascending: false }),
      sb.from('familias').select('id,formando_nome,resp1_nome,resp2_nome,resp1_cpf,telefone,forma_pagamento')
    ])
    const mapa = Object.fromEntries((fams || []).map(f => [f.id, f]))
    setSt({ itens: (pags || []).map(p => ({ ...p, fam: mapa[p.familia_id] || {} })) })
  }
  useEffect(() => { carregar() }, [])
  useEffect(() => {
    if (st?.itens?.length) compararComprovantes(st.itens, hashCache.current).then(setCompInfo)
  }, [st?.itens])

  async function confirmar(id) {
    await sb.from('pagamentos').update({ status: 'confirmado', revisado_em: new Date().toISOString() }).eq('id', id)
    carregar()
  }
  async function salvarPagador(id) {
    await sb.from('pagamentos').update({ pagador_nome: editNome.trim() || null }).eq('id', id)
    setEditId(null)
    carregar()
  }

  if (!st) return <main><p className="mut">Carregando…</p></main>
  if (st.negado) return <main><h1>Acesso restrito</h1></main>

  const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = norm(busca.trim())
  const lista = st.itens.filter(x => {
    if (filtro !== 'todos' && x.status !== filtro) return false
    if (!q) return true
    return [x.pagador_nome, x.fam.resp1_nome, x.fam.resp2_nome, x.fam.formando_nome, x.fam.resp1_cpf].some(v => norm(v).includes(q))
  })

  const totConf = st.itens.filter(x => x.status === 'confirmado').reduce((s, x) => s + +x.valor, 0)
  const totAnalise = st.itens.filter(x => x.status === 'enviado').reduce((s, x) => s + +x.valor, 0)

  function exportarCsv() {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const cab = ['Enviado em', 'Pagador (recibo)', 'Responsavel 1', 'Responsavel 2', 'Formando', 'Parcela', 'Valor', 'Status', 'Revisado em', 'Motivo']
    const linhas = lista.map(x => [
      data(x.criado_em),
      x.pagador_nome || x.fam.resp1_nome || '',
      x.fam.resp1_nome || '',
      x.fam.resp2_nome || '',
      x.fam.formando_nome || '',
      x.fam.forma_pagamento === '2x' ? `${x.parcela}ª` : 'À vista',
      x.valor,
      x.status,
      data(x.revisado_em),
      x.motivo || ''
    ].map(esc).join(';'))
    const blob = new Blob(['\uFEFF' + [cab.map(esc).join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `comprovantes-formatura-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const labelStatus = { enviado: ['an', 'Em análise'], confirmado: ['ok', 'Confirmado'], recusado: ['pe', 'Recusado'] }

  return (
    <main>
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <h1>Relatório de comprovantes</h1>
        <div className="row">
          <a className="btn" href="/admin">Voltar ao painel</a>
          <button onClick={exportarCsv}>Exportar CSV</button>
          <button className="p" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </div>

      <div className="cards">
        <div className="card"><small>Confirmado</small><b className="num" style={{ color: 'var(--ok)' }}>{brl(totConf)}</b></div>
        <div className="card"><small>Em análise</small><b className="num" style={{ color: 'var(--info)' }}>{brl(totAnalise)}</b></div>
        <div className="card"><small>Comprovantes listados</small><b className="num">{lista.length}</b></div>
      </div>

      {compInfo.repetidos.size > 0 && <div className="box err" style={{ marginBottom: 12 }}><b>Atenção: comprovante repetido detectado!</b> Há pagamentos marcados abaixo com o mesmo arquivo de comprovante.</div>}

      <div className="box row no-print" style={{ justifyContent: 'space-between' }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome no recibo, responsável ou formando…" style={{ flex: 1, minWidth: 220 }} />
        <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="todos">Todos os status</option>
          <option value="enviado">Em análise</option>
          <option value="confirmado">Confirmados</option>
          <option value="recusado">Recusados</option>
        </select>
      </div>

      <section className="box" style={{ overflowX: 'auto' }}>
        {!lista.length ? <p className="mut">Nenhum comprovante encontrado.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                <th style={{ padding: '8px 6px' }}>Pagador (recibo / responsáveis)</th>
                <th style={{ padding: '8px 6px' }}>Formando</th>
                <th style={{ padding: '8px 6px' }}>Parcela</th>
                <th style={{ padding: '8px 6px' }}>Valor</th>
                <th style={{ padding: '8px 6px' }}>Enviado em</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
                <th className="no-print" style={{ padding: '8px 6px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(x => {
                const stP = labelStatus[x.status] || ['pe', x.status]
                const nomeRecibo = x.pagador_nome || x.fam.resp1_nome || '—'
                return (
                  <tr key={x.id} style={{ borderBottom: '1px solid var(--line)', verticalAlign: 'top' }}>
                    <td style={{ padding: '8px 6px' }}>
                      {editId === x.id ? (
                        <div className="row" style={{ gap: 4 }}>
                          <input value={editNome} onChange={e => setEditNome(e.target.value)} placeholder="Nome no recibo" style={{ maxWidth: 200, fontSize: 12.5 }} />
                          <button className="p" style={{ fontSize: 12 }} onClick={() => salvarPagador(x.id)}>Salvar</button>
                          <button style={{ fontSize: 12 }} onClick={() => setEditId(null)}>Cancelar</button>
                        </div>
                      ) : (
                        <>
                          <b>{nomeRecibo}</b>{' '}
                          <button className="no-print" onClick={() => { setEditId(x.id); setEditNome(x.pagador_nome || x.fam.resp1_nome || '') }} style={{ fontSize: 11, padding: '1px 6px', marginLeft: 4 }}>editar</button>
                          <div className="mut" style={{ fontSize: 12 }}>
                            Resp.: {x.fam.resp1_nome || '—'}{x.fam.resp2_nome ? ` · ${x.fam.resp2_nome}` : ''}
                          </div>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{x.fam.formando_nome || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{x.fam.forma_pagamento === '2x' ? `${x.parcela}ª` : 'À vista'}</td>
                    <td className="num" style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{brl(x.valor)}</td>
                    <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', fontSize: 12.5 }}>{data(x.criado_em)}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <span className={'pill ' + stP[0]}>{stP[1]}</span>
                      {compInfo.repetidos.has(compInfo.mapa.get(x.id)) && <div className="err" style={{ fontSize: 11.5, marginTop: 2 }}>Comprovante repetido</div>}
                      {x.revisado_em && <div className="mut" style={{ fontSize: 11.5, marginTop: 2 }}>{data(x.revisado_em)}</div>}
                    </td>
                    <td className="no-print" style={{ padding: '8px 6px' }}>
                      <div className="row" style={{ gap: 6 }}>
                        <button style={{ fontSize: 12.5 }} onClick={() => abrir(x.comprovante_path)}>Ver</button>
                        {x.status === 'enviado' && <button className="p" style={{ fontSize: 12.5 }} onClick={() => confirmar(x.id)}>Confirmar</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
