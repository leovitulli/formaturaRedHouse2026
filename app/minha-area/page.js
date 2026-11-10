'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { sb, brl, data, parcelas, pixPayload, encargos } from '@/lib/util'

function Parcela({ p, fam, cfg, envios, recarregar }) {
  const ult = envios.filter(x => x.parcela === p.n).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0]
  const [qr, setQr] = useState('')
  const [arq, setArq] = useState(null)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const aberta = !ult || ult.status === 'recusado'
  const enc = encargos(p.valor, cfg)
  const valorPagar = aberta ? enc.total : p.valor
  const pix = pixPayload({ chave: cfg.pix_chave, nome: cfg.pix_nome, cidade: cfg.pix_cidade, valor: valorPagar, txid: 'FORM' + fam.id.slice(0, 8) + 'P' + p.n })
  useEffect(() => { if (aberta) QRCode.toDataURL(pix, { width: 220, margin: 1 }).then(setQr) }, [pix, aberta])

  async function enviar() {
    if (!arq) return setErro('Selecione o comprovante (foto ou PDF).')
    setEnviando(true)
    const path = `${fam.user_id}/parcela${p.n}-${Date.now()}.${arq.name.split('.').pop()}`
    const { error } = await sb.storage.from('comprovantes').upload(path, arq)
    if (!error) {
      const { error: e2 } = await sb.from('pagamentos').insert({ familia_id: fam.id, parcela: p.n, valor: valorPagar, comprovante_path: path })
      if (!e2) { setEnviando(false); return recarregar() }
    }
    setEnviando(false); setErro('Não foi possível enviar. Tente de novo.')
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(pix); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { }
  }

  const status = !ult ? ['pe', 'Aguardando pagamento'] : ult.status === 'confirmado' ? ['ok', 'Pago'] : ult.status === 'enviado' ? ['an', 'Comprovante em análise'] : ['pe', 'Pendente']
  return (
    <div className="box">
      <div className="row"><b>{p.n === 1 && fam.forma_pagamento === 'avista' ? 'Pagamento à vista' : `Parcela ${p.n} de 2`}</b>
        <span className="num">{brl(aberta ? valorPagar : (ult?.valor ?? p.valor))} · {p.quando}</span><span className={'pill ' + status[0]}>{status[1]}</span></div>
      {ult && ult.status !== 'recusado' && <p className="mut">Comprovante enviado em {data(ult.criado_em)}.</p>}
      {ult?.status === 'recusado' && <p className="err">Precisamos de um novo comprovante. {ult.motivo || 'Confira o valor e envie novamente.'}</p>}
      {aberta && <>
        {enc.dias > 0 && <p className="err">Em atraso há {enc.dias} dia(s). Valor original {brl(p.valor)} + multa de {cfg.multa_pct}% ({brl(enc.multa)}) + juros de {cfg.juros_mes}% ao mês proporcionais ({brl(enc.juros)}) = <b>{brl(enc.total)}</b>. O QR Code já está com o valor atualizado de hoje.</p>}
        <p className="mut">1. Pague com o Pix abaixo (o valor já está preenchido). 2. Envie o comprovante.</p>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {qr && <img src={qr} alt="QR Code Pix" width="180" height="180" />}
          <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 8 }}>
            <div className="pix">{pix}</div>
            <div><button type="button" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar código Pix'}</button></div>
            <p className="mut">Favorecido: {cfg.pix_nome}</p>
          </div>
        </div>
        <label>Comprovante<input type="file" accept="image/*,application/pdf" onChange={e => { setArq(e.target.files[0]); setErro('') }} /></label>
        {erro && <p className="err">{erro}</p>}
        <div><button className="p" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar comprovante'}</button></div>
      </>}
    </div>
  )
}

const TIPOS = { formando: 'Formando', mae: 'Mãe', pai: 'Pai', responsavel: 'Outro responsável' }

function Rostos({ fam, rostos, recarregar }) {
  const [tipo, setTipo] = useState('formando')
  const [arq, setArq] = useState(null)
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState('')
  const [env, setEnv] = useState(false)
  const [urls, setUrls] = useState({})
  const primeiro = fam.formando_nome.split(' ')[0]
  const temFormando = rostos.some(r => r.tipo === 'formando')

  useEffect(() => {
    if (!rostos.length) return
    sb.storage.from('selfies').createSignedUrls(rostos.map(r => r.path), 600)
      .then(({ data }) => setUrls(Object.fromEntries((data || []).map((d, i) => [rostos[i].id, d.signedUrl]))))
  }, [rostos])

  async function enviar() {
    if (!arq) return setErro('Escolha uma foto do rosto.')
    if (!ok) return setErro('Marque a autorização para continuar.')
    setEnv(true); setErro('')
    const path = `${fam.user_id}/${tipo}-${Date.now()}.${arq.name.split('.').pop()}`
    const { error } = await sb.storage.from('selfies').upload(path, arq)
    const r = !error && await sb.from('rostos').insert({ familia_id: fam.id, tipo, path, consentimento: true })
    setEnv(false)
    if (error || r.error) return setErro('Não foi possível enviar. Tente de novo.')
    setArq(null); setOk(false); recarregar()
  }
  async function remover(r) {
    await sb.storage.from('selfies').remove([r.path])
    await sb.from('rostos').delete().eq('id', r.id)
    recarregar()
  }

  return (
    <section className="box" style={!rostos.length ? { borderColor: 'var(--acc)', borderWidth: 2 } : {}}>
      <h2>{rostos.length ? 'Rostos para encontrar as fotos' : `Ajude a encontrar as fotos de ${primeiro}`}</h2>
      {!rostos.length && <p>Depois do evento, o sistema procura automaticamente as fotos de {primeiro} entre centenas de imagens. Para isso, precisamos de uma foto de rosto como referência.</p>}
      <ul className="mut">
        <li><b>Melhor opção:</b> uma foto do rosto de {primeiro}, de frente e com boa luz.</li>
        <li><b>Prefere não enviar a do formando?</b> Envie a sua, da mãe ou do pai, de quem vai estar na festa. O sistema acha você nas fotos, identifica {primeiro} ao seu lado e então encontra {primeiro} nas demais.</li>
        <li>Pode enviar mais de um rosto. Quanto mais referências, mais fotos encontradas.</li>
      </ul>
      {!!rostos.length && <div className="row">{rostos.map(r => (
        <div key={r.id} style={{ display: 'grid', gap: 4, justifyItems: 'center', width: 96 }}>
          {urls[r.id] ? <img src={urls[r.id]} alt={TIPOS[r.tipo]} width="80" height="80" style={{ objectFit: 'cover', borderRadius: 40 }} /> : <div style={{ width: 80, height: 80, borderRadius: 40, background: 'var(--line)' }} />}
          <span className="mut" style={{ fontSize: 12.5 }}>{TIPOS[r.tipo]}</span>
          <button className="x" style={{ fontSize: 12, padding: '2px 6px' }} onClick={() => remover(r)}>remover</button>
        </div>))}</div>}
      {!!rostos.length && !temFormando && <p className="mut">Sem foto do formando: vamos identificar {primeiro} pelas fotos em que aparece junto com o responsável.</p>}
      <div className="grid">
        <label>De quem é o rosto<select value={tipo} onChange={e => setTipo(e.target.value)}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Foto do rosto (de frente, sem óculos escuros)<input type="file" accept="image/*" onChange={e => { setArq(e.target.files[0]); setErro('') }} /></label>
      </div>
      <label className="chk"><input type="checkbox" checked={ok} onChange={e => { setOk(e.target.checked); setErro('') }} /> Autorizo o uso desta foto apenas para encontrar e separar as fotos da minha família no evento. Ela será apagada após a entrega.</label>
      {erro && <p className="err">{erro}</p>}
      <div><button className="p" onClick={enviar} disabled={env}>{env ? 'Enviando…' : 'Enviar rosto'}</button></div>
    </section>
  )
}

export default function MinhaArea() {
  const [st, setSt] = useState(null)
  const [fotos, setFotos] = useState([])

  async function carregar() {
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return (location.href = '/entrar')
    const { data: u, error: eu } = await sb.auth.getUser()
    if (eu || !u?.user) { await sb.auth.signOut(); return (location.href = '/entrar') }
    const [{ data: fam }, { data: cfg }] = await Promise.all([
      sb.from('familias').select('*').eq('user_id', session.user.id).maybeSingle(),
      sb.from('config').select('*').single()])
    if (!fam) return setSt({ semCadastro: true })
    const [{ data: env }, { data: ros }] = await Promise.all([
      sb.from('pagamentos').select('*').eq('familia_id', fam.id),
      sb.from('rostos').select('*').eq('familia_id', fam.id).order('criado_em')])
    setSt({ fam, cfg, env: env || [], rostos: ros || [] })
    const { data: fs } = await sb.from('fotos').select('path').eq('familia_id', fam.id).order('path')
    if (fs?.length) {
      const paths = fs.map(x => x.path)
      const [{ data: ver }, { data: bx }] = await Promise.all([
        sb.storage.from('fotos').createSignedUrls(paths, 3600),
        sb.storage.from('fotos').createSignedUrls(paths, 3600, { download: true })])
      setFotos((ver || []).map((v, i) => ({ ver: v.signedUrl, baixar: bx?.[i]?.signedUrl })))
    }
  }
  useEffect(() => { carregar() }, [])
  const sair = async () => { await sb.auth.signOut(); location.href = '/' }

  if (!st) return <main><p className="mut">Carregando…</p></main>
  if (st.semCadastro) return <main><h1>Cadastro não encontrado</h1><a className="btn p" href="/cadastro">Fazer cadastro</a></main>

  const { fam, cfg, env, rostos } = st
  const pago = env.filter(x => x.status === 'confirmado').reduce((s, x) => s + +x.valor, 0)
  const quitado = pago >= fam.valor

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><h1>{fam.formando_nome}</h1><p className="mut">Responsáveis: {fam.resp1_nome} ({fam.resp1_parentesco}){fam.resp2_nome && `, ${fam.resp2_nome} (${fam.resp2_parentesco})`}</p></div>
        <button onClick={sair}>Sair</button>
      </div>

      <section className="box">
        <h2>Resumo</h2>
        <div className="cards">
          <div className="card"><small>Valor total</small><b className="num">{brl(fam.valor)}</b></div>
          <div className="card"><small>Pago e confirmado</small><b className="num" style={{ color: 'var(--ok)' }}>{brl(pago)}</b></div>
          <div className="card"><small>Falta pagar</small><b className="num" style={{ color: 'var(--warn)' }}>{brl(Math.max(fam.valor - pago, 0))}</b></div>
        </div>
        <p className="mut">Proposta aceita em {data(fam.aceite_em)}.</p>
      </section>
      {fam.valor - pago > 0 && <p className="mut">Pagamentos em aberto após {new Date((cfg.vencimento || '2026-12-12') + 'T12:00').toLocaleDateString('pt-BR')} têm multa de {cfg.multa_pct}% e juros de {cfg.juros_mes}% ao mês, proporcionais aos dias de atraso.</p>}

      {!rostos.length && <Rostos fam={fam} rostos={rostos} recarregar={carregar} />}

      {parcelas(fam).map(p => <Parcela key={p.n} p={p} fam={fam} cfg={cfg} envios={env} recarregar={carregar} />)}

      {!!rostos.length && <Rostos fam={fam} rostos={rostos} recarregar={carregar} />}

      <section className="box">
        <h2>Fotos de {fam.formando_nome.split(' ')[0]}</h2>
        {!quitado ? <p className="mut">As fotos ficam disponíveis aqui depois que o pagamento total for confirmado.</p>
          : !fotos.length ? <p className="mut">As fotos serão publicadas aqui em até 15 dias úteis após o evento.</p>
          : <>
            <p className="mut">{fotos.length} fotos. Toque em "baixar" para salvar cada uma. Os links valem por 1 hora; se expirar, recarregue a página.</p>
            <div className="galeria">{fotos.map((f, i) => <div key={i}><a href={f.ver} target="_blank" rel="noreferrer"><img src={f.ver} alt={`Foto ${i + 1}`} loading="lazy" /></a><a href={f.baixar} className="mut" style={{ background: 'none', aspectRatio: 'auto' }}>baixar</a></div>)}</div>
          </>}
      </section>

      <section className="box leg">
        <h2 style={{ color: 'var(--fg)' }}>Legenda</h2>
        <div><b>Multa e juros</b>: aplicados só a parcelas não pagas até o dia do evento; o valor da parcela e o QR Code já mostram o total atualizado.</div>
        <div><span className="pill pe">Aguardando pagamento</span> ainda não recebemos comprovante dessa parcela.</div>
        <div><span className="pill an">Comprovante em análise</span> recebemos o comprovante e vamos conferir no extrato.</div>
        <div><span className="pill ok">Pago</span> pagamento conferido e confirmado.</div>
        <div><span className="pill pe">Pendente</span> depois de um pedido de novo comprovante: o motivo aparece na parcela; envie outro.</div>
      </section>
    </main>
  )
}
