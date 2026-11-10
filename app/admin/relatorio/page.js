'use client'
import { useEffect, useState } from 'react'
import { sb, brl } from '@/lib/util'

const dt = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' (Brasília) · ' + new Date(d).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'
const cpf = c => (c || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
const PAR = { mae: 'Mãe', pai: 'Pai', formando: 'Formando', responsavel: 'Responsável' }

async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}

function Linha({ k, v }) {
  return <tr><td style={{ color: 'var(--mut)', padding: '4px 12px 4px 0', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{k}</td><td style={{ padding: '4px 0', wordBreak: 'break-word' }}>{v || '—'}</td></tr>
}

function Relatorio({ f, pags, aud, rostos }) {
  const [ok, setOk] = useState(null)
  useEffect(() => { if (f.aceite_texto) sha256(f.aceite_texto).then(h => setOk(h === f.aceite_hash)) }, [f])
  const pago = pags.filter(p => p.status === 'confirmado').reduce((s, p) => s + +p.valor, 0)
  return (
    <article className="box rel">
      <h2>Termo de aceite eletrônico · {f.formando_nome}</h2>
      <p className="mut">Código do registro: {f.id}</p>

      <h3>1. Contratante (quem assinou)</h3>
      <table><tbody>
        <Linha k="Nome completo" v={f.resp1_nome} />
        <Linha k="CPF" v={cpf(f.resp1_cpf)} />
        <Linha k="Parentesco" v={f.resp1_parentesco} />
        <Linha k="E-mail (login)" v={f.email} />
        <Linha k="Telefone" v={f.telefone} />
        <Linha k="Segundo responsável" v={f.resp2_nome && `${f.resp2_nome} (${f.resp2_parentesco})`} />
        <Linha k="Formando" v={f.formando_nome} />
      </tbody></table>

      <h3>2. Evidências da assinatura eletrônica</h3>
      <table><tbody>
        <Linha k="Data e hora do aceite" v={dt(f.aceite_em)} />
        <Linha k="Endereço IP" v={f.aceite_ip || 'não registrado (aceite anterior à auditoria)'} />
        <Linha k="Navegador / aparelho" v={f.aceite_navegador} />
        <Linha k="Versão da proposta" v={f.aceite_versao} />
        <Linha k="Hash SHA-256 do texto aceito" v={<code style={{ fontSize: 12 }}>{f.aceite_hash || '—'}</code>} />
        <Linha k="Integridade do texto" v={!f.aceite_texto ? 'texto não registrado (aceite anterior à auditoria)' : ok === null ? 'verificando…' : ok ? 'Íntegro: o texto abaixo é idêntico ao aceito' : 'ATENÇÃO: o texto não confere com o hash'} />
        <Linha k="Proposta, prazos, valor e multa" v="Aceito (marcação obrigatória)" />
        <Linha k="Reconhecimento facial" v={f.aceite_biometria ? 'Autorizado no cadastro' : 'Não autorizado no cadastro'} />
        <Linha k="Uso em portfólio e redes" v={f.aceite_portfolio ? 'Autorizado' : 'Não autorizado'} />
        <Linha k="Rostos de referência" v={rostos.length ? rostos.map(r => PAR[r.tipo]).join(', ') : 'Nenhum'} />
      </tbody></table>

      <h3>3. Situação financeira</h3>
      <table><tbody>
        <Linha k="Valor contratado" v={brl(f.valor)} />
        <Linha k="Forma" v={f.forma_pagamento === '2x' ? '2 parcelas' : 'À vista'} />
        <Linha k="Pago e confirmado" v={brl(pago)} />
        <Linha k="Saldo devedor" v={brl(Math.max(f.valor - pago, 0))} />
      </tbody></table>
      {!!pags.length && <table style={{ width: '100%', marginTop: 6, fontSize: 13.5 }}><thead><tr><th align="left">Parcela</th><th align="left">Valor</th><th align="left">Enviado em</th><th align="left">Situação</th></tr></thead>
        <tbody>{pags.map(p => <tr key={p.id}><td>{p.parcela}</td><td className="num">{brl(p.valor)}</td><td>{new Date(p.criado_em).toLocaleString('pt-BR')}</td><td>{({ enviado: 'Em análise', confirmado: 'Confirmado', recusado: 'Pendente (novo comprovante pedido)' })[p.status]}{p.motivo ? ` · ${p.motivo}` : ''}</td></tr>)}</tbody></table>}

      <h3>4. Trilha de auditoria</h3>
      {!aud.length ? <p className="mut">Sem eventos registrados.</p> :
        <table style={{ width: '100%', fontSize: 13 }}><thead><tr><th align="left">Data e hora (Brasília)</th><th align="left">Evento</th><th align="left">Por</th><th align="left">IP</th></tr></thead>
          <tbody>{aud.map(a => <tr key={a.id} style={{ verticalAlign: 'top' }}>
            <td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>{new Date(a.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
            <td>{a.evento}{a.detalhes?.motivo ? ` · ${a.detalhes.motivo}` : ''}{a.detalhes?.parcela ? ` · parcela ${a.detalhes.parcela}, ${brl(a.detalhes.valor)}` : ''}</td>
            <td>{a.autor_email || 'sistema'}</td><td>{a.ip || '—'}</td></tr>)}</tbody></table>}

      <h3>5. Texto integral da proposta aceita</h3>
      {f.aceite_texto ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, margin: 0, background: 'var(--bg)', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>{f.aceite_texto}</pre>
        : <p className="mut">Aceite feito antes do registro do texto integral.</p>}

      <p className="mut" style={{ marginTop: 8 }}>Assinatura eletrônica simples, nos termos da Lei 14.063/2020 e da MP 2.200-2/2001, art. 10, §2º. Relatório gerado em {dt(new Date())}.</p>
    </article>
  )
}

export default function Pagina() {
  const [st, setSt] = useState(null)
  const [sel, setSel] = useState('todos')

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) return (location.href = '/entrar')
      const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
      if (!adm) return setSt({ negado: true })
      const [a, b, c, d] = await Promise.all([
        sb.from('familias').select('*').order('formando_nome'),
        sb.from('pagamentos').select('*').order('criado_em'),
        sb.from('auditoria').select('*').order('em'),
        sb.from('rostos').select('familia_id,tipo')])
      setSt({ fams: a.data || [], pags: b.data || [], aud: c.data || [], rostos: d.data || [] })
      const q = new URLSearchParams(location.search).get('f'); if (q) setSel(q)
    })()
  }, [])

  if (!st) return <main><p className="mut">Carregando…</p></main>
  if (st.negado) return <main><h1>Acesso restrito</h1></main>
  const lista = sel === 'todos' ? st.fams : st.fams.filter(f => f.id === sel)

  return (
    <main>
      <style>{`.rel h3{font-size:15px;margin:10px 0 2px} .rel table{border-collapse:collapse} .rel th{font-weight:600;color:var(--mut);padding:4px 8px 4px 0;border-bottom:1px solid var(--line)} .rel td{border-bottom:1px solid var(--line);padding:4px 8px 4px 0}
        @media print{.topo,.noprint{display:none!important} body{background:#fff;color:#000} .rel{border:none;page-break-after:always;padding:0} :root{--mut:#444;--line:#ccc;--bg:#f6f6f6;--fg:#000}}`}</style>
      <div className="row noprint" style={{ justifyContent: 'space-between' }}>
        <h1>Relatório de aceites e auditoria</h1>
        <div className="row">
          <select value={sel} onChange={e => setSel(e.target.value)} style={{ width: 'auto' }}>
            <option value="todos">Todas as famílias ({st.fams.length})</option>
            {st.fams.map(f => <option key={f.id} value={f.id}>{f.formando_nome}</option>)}
          </select>
          <button className="p" onClick={() => window.print()}>Imprimir / salvar PDF</button>
          <a className="btn" href="/admin">Voltar</a>
        </div>
      </div>
      <section className="box leg noprint">
        <h2 style={{ color: 'var(--fg)' }}>Legenda</h2>
        <div><b>IP e navegador</b>: capturados pelo servidor no momento do aceite; não podem ser alterados pelo navegador da família.</div>
        <div><b>Hash SHA-256</b>: impressão digital do texto aceito. Qualquer mudança de uma letra no texto gera outro hash. "Íntegro" significa que o texto mostrado é exatamente o aceito.</div>
        <div><b>Trilha de auditoria</b>: registro automático de cada ação (aceite, comprovante, confirmação, pedido de novo comprovante, rostos, fotos publicadas). O sistema não permite editar nem apagar esses registros.</div>
        <div><b>Por</b>: e-mail de quem fez a ação. "sistema" = ação automática (ex.: script de fotos).</div>
        <div>Para guardar como prova: <b>Imprimir / salvar PDF</b> → Salvar como PDF. Cada família sai em uma página separada.</div>
      </section>
      {lista.map(f => <Relatorio key={f.id} f={f} pags={st.pags.filter(p => p.familia_id === f.id)} aud={st.aud.filter(a => a.familia_id === f.id)} rostos={st.rostos.filter(r => r.familia_id === f.id)} />)}
    </main>
  )
}
