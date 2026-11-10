'use client'
import { useEffect, useState } from 'react'
import { sb, brl, data, parcelas } from '@/lib/util'

async function abrir(bucket, path) {
  const { data: d } = await sb.storage.from(bucket).createSignedUrl(path, 600)
  if (d) window.open(d.signedUrl, '_blank')
}

function BotaoConfirmar({ txt, onOk, cls = '' }) {
  const [arm, setArm] = useState(false)
  return <button className={cls} onClick={() => { if (arm) { setArm(false); onOk() } else { setArm(true); setTimeout(() => setArm(false), 3000) } }}>{arm ? 'Confirmar?' : txt}</button>
}

function PedirNovo({ onOk }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  if (!aberto) return <button onClick={() => setAberto(true)}>Pedir novo comprovante</button>
  return (
    <div className="row" style={{ flex: '1 1 100%' }}>
      <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ maxWidth: 360 }}>
        <option value="">Motivo (a família vai ver)</option>
        <option>Pagamento não encontrado no extrato.</option>
        <option>Valor diferente do combinado.</option>
        <option>Comprovante ilegível. Envie uma imagem mais nítida.</option>
        <option>Comprovante de agendamento, não de pagamento.</option>
      </select>
      <button className="p" onClick={() => { onOk(motivo || 'Envie o comprovante novamente.'); setAberto(false) }}>Enviar pedido</button>
      <button onClick={() => setAberto(false)}>Cancelar</button>
    </div>
  )
}

function GaleriaAdmin({ fid, nFotos, recarregar }) {
  const [fotos, setFotos] = useState(null)
  async function carregar() {
    const { data } = await sb.from('fotos').select('id,path').eq('familia_id', fid).order('path')
    if (!data?.length) return setFotos([])
    const { data: urls } = await sb.storage.from('fotos').createSignedUrls(data.map(x => x.path), 3600)
    setFotos(data.map((x, i) => ({ ...x, url: urls?.[i]?.signedUrl, nome: x.path.split('/').pop() })))
  }
  useEffect(() => { carregar() }, [fid, nFotos])
  async function remover(x) {
    await sb.storage.from('fotos').remove([x.path])
    await sb.from('fotos').delete().eq('id', x.id)
    recarregar()
  }
  if (!fotos) return <p className="mut">Carregando fotos…</p>
  if (!fotos.length) return null
  const turma = fotos.filter(x => x.nome.startsWith('turma-')).length
  return (
    <>
      <p className="mut">{fotos.length - turma} do formando · {turma} da turma</p>
      <div className="galeria">{fotos.map(x => (
        <div key={x.id} style={{ display: 'grid', gap: 2 }}>
          <a href={x.url} target="_blank" rel="noreferrer" title={x.nome}><img src={x.url} alt={x.nome} loading="lazy" /></a>
          <div className="row" style={{ justifyContent: 'space-between', gap: 4 }}>
            <span className="mut" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{x.nome.replace(/^\d{13}-/, '')}</span>
            <BotaoConfirmar txt="remover" onOk={() => remover(x)} />
          </div>
        </div>))}</div>
    </>
  )
}

function Familia({ f, env, nFotos, rostos, recarregar }) {
  const [aberta, setAberta] = useState(false)
  const [up, setUp] = useState('')
  const pago = env.filter(x => x.status === 'confirmado').reduce((s, x) => s + +x.valor, 0)
  const analise = env.some(x => x.status === 'enviado')
  const st = pago >= f.valor ? ['ok', 'Quitado'] : analise ? ['an', 'Comprovante em análise'] : pago > 0 ? ['pa', 'Parcial'] : ['pe', 'Pendente']

  async function revisar(id, status, motivo = null) {
    await sb.from('pagamentos').update({ status, motivo, revisado_em: new Date().toISOString() }).eq('id', id)
    recarregar()
  }
  async function enviarFotos(e) {
    const arqs = [...e.target.files]; let ok = 0
    for (const a of arqs) {
      setUp(`Enviando ${ok + 1} de ${arqs.length}…`)
      const path = `${f.id}/${Date.now()}-${a.name.replace(/[^\w.-]/g, '_')}`
      const { error } = await sb.storage.from('fotos').upload(path, a)
      if (!error && !(await sb.from('fotos').insert({ familia_id: f.id, path })).error) ok++
    }
    setUp(`${ok} de ${arqs.length} fotos enviadas.`); e.target.value = ''; recarregar()
  }
  async function apagar() {
    await sb.from('familias').delete().eq('id', f.id); recarregar()
  }

  return (
    <div className="fam">
      <div className="row">
        <b style={{ flex: 1, minWidth: 180 }}>{f.formando_nome}</b>
        <span className="num">{brl(pago)} <span className="mut">de {brl(f.valor)}</span></span>
        <span className={'pill ' + st[0]}>{st[1]}</span>
        <button onClick={() => setAberta(!aberta)}>{aberta ? 'Fechar' : 'Abrir'}</button>
      </div>
      {aberta && <div className="det">
        <div className="det-grid">
          <div className="card">
            <small>Quem assinou</small>
            <div className="row" style={{ gap: 10, marginTop: 4 }}>
              <span className="av">{f.resp1_nome.split(' ').map(x => x[0]).slice(0, 2).join('')}</span>
              <div style={{ minWidth: 0 }}>
                <b>{f.resp1_nome}</b>
                <div className="mut">{f.resp1_parentesco} · CPF {f.resp1_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</div>
              </div>
            </div>
            {f.resp2_nome && <div className="mut" style={{ marginTop: 6 }}>+ {f.resp2_nome} ({f.resp2_parentesco})</div>}
            <div className="mut" style={{ marginTop: 6, wordBreak: 'break-all' }}>{f.telefone} · {f.email}</div>
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <span className={'pill ' + (rostos.length ? 'ok' : 'pe')}>{rostos.length ? '✓' : '✗'} Rosto</span>
              <span className={'pill ' + (f.aceite_portfolio ? 'ok' : 'pe')}>{f.aceite_portfolio ? '✓' : '✗'} Portfólio</span>
              <a href={'/admin/relatorio?f=' + f.id} style={{ fontSize: 13 }}>Relatório</a>
            </div>
            {!!rostos.length && <div className="row" style={{ gap: 6, marginTop: 6 }}>{rostos.map(r => <button key={r.id} style={{ fontSize: 12.5, padding: '3px 8px' }} onClick={() => abrir('selfies', r.path)}>Ver rosto: {({ formando: 'formando', mae: 'mãe', pai: 'pai', responsavel: 'responsável' })[r.tipo]}</button>)}</div>}
          </div>

          <div className="card">
            <small>Pagamento · {f.forma_pagamento === '2x' ? '2 parcelas' : 'à vista'}</small>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden', margin: '8px 0' }}><div style={{ height: '100%', width: Math.min(100, pago / f.valor * 100) + '%', background: 'var(--ok)' }} /></div>
            {parcelas(f).map(pc => {
              const u = env.filter(x => x.parcela === pc.n).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0]
              const s = !u ? ['pe', 'Aguardando'] : u.status === 'confirmado' ? ['ok', 'Pago'] : u.status === 'enviado' ? ['an', 'Conferir'] : ['pe', 'Reenvio pedido']
              return (
                <div key={pc.n} className="parc">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="num"><b>{brl(u?.valor ?? pc.valor)}</b> <span className="mut">{parcelas(f).length > 1 ? `${pc.n}ª parcela` : 'à vista'}</span></span>
                    <span className={'pill ' + s[0]}>{s[1]}</span>
                  </div>
                  {u && <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    <button onClick={() => abrir('comprovantes', u.comprovante_path)}>Ver comprovante</button>
                    {u.status === 'enviado' && <button className="p" onClick={() => revisar(u.id, 'confirmado')}>Confirmar</button>}
                    {u.status === 'enviado' && <PedirNovo onOk={m => revisar(u.id, 'recusado', m)} />}
                    {u.status === 'confirmado' && <PedirNovo onOk={m => revisar(u.id, 'recusado', m)} />}
                  </div>}
                  {u?.status === 'recusado' && u.motivo && <div className="mut" style={{ fontSize: 12.5, marginTop: 4 }}>{u.motivo}</div>}
                </div>)
            })}
          </div>

          <div className="card">
            <small>Fotos</small>
            <b className="num" style={{ display: 'block', fontSize: 28, margin: '4px 0' }}>{nFotos}</b>
            <label className="btn" style={{ display: 'inline-block', color: 'var(--fg)' }}>+ Adicionar fotos<input type="file" accept="image/*" multiple onChange={enviarFotos} hidden /></label>
            {up && <div className="mut" style={{ marginTop: 6 }}>{up}</div>}
          </div>
        </div>
        {nFotos > 0 && <GaleriaAdmin fid={f.id} nFotos={nFotos} recarregar={recarregar} />}
        <div style={{ textAlign: 'right' }}><BotaoConfirmar txt="Excluir cadastro" onOk={apagar} /></div>
      </div>}
    </div>
  )
}

export default function Admin() {
  const [st, setSt] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [salvo, setSalvo] = useState(false)

  async function carregar() {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return (location.href = '/entrar')
    const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
    if (!adm) return setSt({ negado: true })
    const [a, b, c, d, e] = await Promise.all([
      sb.from('familias').select('*').order('formando_nome'),
      sb.from('pagamentos').select('*'),
      sb.from('fotos').select('familia_id'),
      sb.from('config').select('*').single(),
      sb.from('rostos').select('id,familia_id,tipo,path')])
    setSt({ fams: a.data || [], pags: b.data || [], fotos: c.data || [], rostos: e.data || [] }); setCfg(d.data)
  }
  useEffect(() => { carregar() }, [])

  async function salvarCfg(e) {
    e.preventDefault()
    const { id, ...resto } = cfg
    resto.multa_pct = Math.min(2, +resto.multa_pct || 0)
    resto.juros_mes = Math.min(1, +resto.juros_mes || 0)
    await sb.from('config').update(resto).eq('id', 1)
    setSalvo(true); setTimeout(() => setSalvo(false), 2000)
  }

  if (!st) return <main><p className="mut">Carregando…</p></main>
  if (st.negado) return <main><h1>Acesso restrito</h1><p className="mut">Este login não é de administrador.</p></main>

  const { fams, pags, fotos, rostos } = st
  const total = +cfg.total_formandos || 16
  const meta = +cfg.preco * total
  const recebido = pags.filter(p => p.status === 'confirmado').reduce((s, p) => s + +p.valor, 0)
  const analise = pags.filter(p => p.status === 'enviado').reduce((s, p) => s + +p.valor, 0)
  const falta = Math.max(meta - recebido, 0)
  const custo = +cfg.custo_fixo + +cfg.custo_album * total
  const lucro = meta - custo
  const pct = v => Math.min(100, meta ? v / meta * 100 : 0)
  const aConferir = pags.filter(p => p.status === 'enviado').length
  const c = k => e => setCfg({ ...cfg, [k]: e.target.value })

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Painel da formatura</h1>
        <div className="row"><a className="btn p" href="/admin/reconhecimento">Separar fotos</a><a className="btn" href="/admin/plaquinhas">Plaquinhas</a><a className="btn" href="/admin/relatorio">Relatório jurídico</a><button onClick={carregar}>Atualizar</button><button onClick={async () => { await sb.auth.signOut(); location.href = '/' }}>Sair</button></div>
      </div>

      <section className="box">
        <p className="mut">Total a arrecadar ({total} formandos × {brl(cfg.preco)})</p>
        <p className="num" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{brl(meta)}</p>
        <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--line)' }}>
          <div style={{ width: pct(recebido) + '%', background: 'var(--ok)' }} />
          <div style={{ width: pct(analise) + '%', background: 'var(--info)' }} />
        </div>
        <div className="cards">
          <div className="card"><small>Recebido</small><b className="num" style={{ color: 'var(--ok)' }}>{brl(recebido)}</b></div>
          <div className="card"><small>Falta receber</small><b className="num" style={{ color: 'var(--warn)' }}>{brl(falta)}</b></div>
          <div className="card"><small>Famílias cadastradas</small><b className="num">{fams.length} de {total}</b></div>
        </div>
        {aConferir > 0 && <p style={{ color: 'var(--info)' }}><b>{aConferir} comprovante(s) para conferir</b> ({brl(analise)}). Abra a família com o selo azul.</p>}
        <p className="mut">Custo do evento {brl(custo)} · <b style={{ color: lucro < 0 ? 'var(--bad)' : 'var(--ok)' }}>seu lucro se todos pagarem: {brl(lucro)}</b></p>
      </section>

      <section className="box">
        <h2>Formandos</h2>
        {!fams.length ? <p className="mut">Nenhuma família cadastrada ainda. Envie o link da proposta para os pais.</p>
          : fams.map(f => <Familia key={f.id} f={f} env={pags.filter(p => p.familia_id === f.id)} nFotos={fotos.filter(x => x.familia_id === f.id).length} rostos={rostos.filter(r => r.familia_id === f.id)} recarregar={carregar} />)}
      </section>

      <section className="box leg">
        <h2 style={{ color: 'var(--fg)' }}>Legenda</h2>
        <div><b>Total a arrecadar</b>: número de formandos da turma × preço. <b>Barra</b>: verde = recebido, azul = comprovante esperando sua conferência, cinza = falta.</div>
        <div><b>Recebido</b>: só pagamentos que você confirmou. <b>Falta receber</b>: total a arrecadar menos recebido.</div>
        <div><b>Seu lucro se todos pagarem</b>: total a arrecadar menos custo fixo e álbuns.</div>
        <div><span className="pill ok">Quitado</span> pagou tudo · <span className="pill an">Comprovante em análise</span> abra e confira no extrato · <span className="pill pa">Parcial</span> pagou a 1ª parcela · <span className="pill pe">Pendente</span> nada pago ou novo comprovante pedido.</div>
        <div>Ao <b>Abrir</b> uma família: dados de quem assinou, comprovantes (<b>Confirmar</b> ou <b>Pedir novo comprovante</b>), fotos encontradas e envio manual de fotos. A família só vê as fotos depois de quitar.</div>
      </section>

      <details className="box">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Configurações (preço, Pix, custos, multa)</summary>
        <form onSubmit={salvarCfg} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <div className="grid">
            <label>Formandos na turma<input type="number" value={cfg.total_formandos ?? 16} onChange={c('total_formandos')} /></label>
            <label>Preço por formando<input type="number" value={cfg.preco} onChange={c('preco')} /></label>
            <label>Chave Pix<input value={cfg.pix_chave} onChange={c('pix_chave')} /></label>
            <label>Nome do favorecido<input value={cfg.pix_nome} onChange={c('pix_nome')} /></label>
            <label>Cidade do favorecido<input value={cfg.pix_cidade} onChange={c('pix_cidade')} /></label>
            <label>Custo fixo (equipe, áudio, extras)<input type="number" value={cfg.custo_fixo} onChange={c('custo_fixo')} /></label>
            <label>Custo de cada álbum<input type="number" value={cfg.custo_album} onChange={c('custo_album')} /></label>
            <label>Vencimento final (multa a partir do dia seguinte)<input type="date" value={cfg.vencimento || ''} onChange={c('vencimento')} /></label>
            <label>Multa por atraso (%, máx. 2)<input type="number" step="0.1" min="0" max="2" value={cfg.multa_pct ?? 2} onChange={c('multa_pct')} /></label>
            <label>Juros (% ao mês, máx. 1)<input type="number" step="0.1" min="0" max="1" value={cfg.juros_mes ?? 1} onChange={c('juros_mes')} /></label>
          </div>
          <p className="mut">O preço vale para novos cadastros; quem já assinou mantém o valor aceito.</p>
          <div className="row"><button className="p">Salvar</button>{salvo && <span className="okmsg">Salvo.</span>}</div>
        </form>
      </details>
    </main>
  )
}
