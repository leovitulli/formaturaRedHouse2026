'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { sb, brl, data, parcelas, pixPayload, encargos } from '@/lib/util'

async function hashArquivo(arq) {
  const buf = await arq.arrayBuffer()
  const dig = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(dig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function ParcelaTeste({ p, fam, cfg, envios, onEnviar, onSimularStatus }) {
  const ult = envios.filter(x => x.parcela === p.n).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0]
  const [qr, setQr] = useState('')
  const [arq, setArq] = useState(null)
  const [pagador, setPagador] = useState(fam.resp1_nome)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const aberta = !ult || ult.status === 'recusado'
  const enc = encargos(p.valor, cfg)
  const valorPagar = aberta ? enc.total : p.valor
  const pix = pixPayload({ chave: cfg.pix_chave, nome: cfg.pix_nome, cidade: cfg.pix_cidade, valor: valorPagar, txid: 'TESTE000P' + p.n })

  useEffect(() => {
    if (aberta) QRCode.toDataURL(pix, { width: 220, margin: 1 }).then(setQr)
  }, [pix, aberta])

  async function enviar() {
    if (!arq) return setErro('Selecione o comprovante (foto ou PDF).')
    const hash = await hashArquivo(arq)
    onEnviar({
      id: String(Date.now() + Math.random()),
      parcela: p.n,
      valor: valorPagar,
      pagador_nome: pagador.trim() || fam.resp1_nome,
      comprovante_hash: hash,
      nome_arquivo: arq.name,
      status: 'enviado',
      criado_em: new Date().toISOString()
    })
    setArq(null)
    setErro('')
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(pix); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { }
  }

  const status = !ult ? ['pe', 'Aguardando pagamento'] : ult.status === 'confirmado' ? ['ok', 'Pago'] : ult.status === 'enviado' ? ['an', 'Comprovante em análise'] : ['pe', 'Pendente']
  const compRepetido = ult && ult.status !== 'recusado' && ult.comprovante_hash && envios.some(x => x.id !== ult.id && x.status !== 'recusado' && x.comprovante_hash === ult.comprovante_hash)

  return (
    <div className="box">
      <div className="row">
        <b>{p.n === 1 && fam.forma_pagamento === 'avista' ? 'Pagamento à vista' : `Parcela ${p.n} de 2`}</b>
        <span className="num">{brl(aberta ? valorPagar : (ult?.valor ?? p.valor))} · {p.quando}</span>
        <span className={'pill ' + status[0]}>{status[1]}</span>
      </div>
      {ult && ult.status !== 'recusado' && <p className="mut">Comprovante ({ult.nome_arquivo}) enviado em {data(ult.criado_em)} · Pagador: <b>{ult.pagador_nome}</b>.</p>}
      {compRepetido && <p className="err">Este comprovante parece repetido e está sendo analisado. Qualquer coisa entro em contato.</p>}
      {ult?.status === 'recusado' && <p className="err">Precisamos de um novo comprovante. {ult.motivo}</p>}
      {ult && (
        <div className="row" style={{ gap: 6 }}>
          {ult.status === 'enviado' && <button className="p" onClick={() => onSimularStatus(ult.id, 'confirmado')}>Simular: Admin confirmar</button>}
          {ult.status !== 'recusado' && <button onClick={() => onSimularStatus(ult.id, 'recusado', 'Simulação: pedir novo comprovante.')}>Simular: Admin pedir novo</button>}
        </div>
      )}
      {aberta && <>
        <p className="mut">1. Pague com o Pix abaixo (simulação). 2. Envie o comprovante.</p>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {qr && <img src={qr} alt="QR Code Pix" width="180" height="180" />}
          <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 8 }}>
            <div className="pix">{pix}</div>
            <div><button type="button" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar código Pix'}</button></div>
            <p className="mut">Favorecido: {cfg.pix_nome}</p>
          </div>
        </div>
        <label>Nome de quem pagou (como aparece no comprovante)<input value={pagador} onChange={e => setPagador(e.target.value)} /></label>
        <label>Comprovante<input type="file" accept="image/*,application/pdf" onChange={e => { setArq(e.target.files[0]); setErro('') }} /></label>
        {erro && <p className="err">{erro}</p>}
        <div><button className="p" onClick={enviar}>Enviar comprovante (teste)</button></div>
      </>}
    </div>
  )
}

export default function AreaTesteResponsavel() {
  const [acesso, setAcesso] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [forma, setForma] = useState('2x')
  const [formando, setFormando] = useState('Formando Teste (Simulação)')
  const [resp1, setResp1] = useState('Responsável Teste')
  const [envios, setEnvios] = useState([])
  const [rostos, setRostos] = useState([])
  const [dupTeste, setDupTeste] = useState({ formando: '', cpf: '', resp1: '', resultado: null })

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) return (location.href = '/entrar')
      const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
      if (!adm) return setAcesso(false)
      const { data: c } = await sb.from('config').select('*').single()
      setCfg(c)
      setAcesso(true)
    })()
  }, [])

  async function testarDuplicado(e) {
    e.preventDefault()
    const { data: msg, error } = await sb.rpc('verificar_cadastro_duplicado', {
      p_formando: dupTeste.formando.trim(),
      p_cpf: dupTeste.cpf.replace(/\D/g, ''),
      p_resp1: dupTeste.resp1.trim()
    })
    setDupTeste(prev => ({
      ...prev,
      resultado: error ? `Erro: ${error.message}` : (msg || 'Liberado: não há cadastro duplicado para esses dados.')
    }))
  }

  function addRosto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setRostos(prev => [...prev, { id: String(Date.now()), nome: file.name, url: URL.createObjectURL(file) }])
    e.target.value = ''
  }

  if (acesso === null) return <main><p className="mut">Carregando…</p></main>
  if (acesso === false) return <main><h1>Acesso restrito</h1><p className="mut">Área exclusiva para administradores.</p></main>

  const fam = {
    id: 'teste-oculto',
    formando_nome: formando,
    resp1_nome: resp1,
    forma_pagamento: forma,
    valor: +cfg.preco || 630
  }
  const pago = envios.filter(x => x.status === 'confirmado').reduce((s, x) => s + +x.valor, 0)
  const quitado = pago >= fam.valor

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Área do responsável (Simulação oculta)</h1>
          <p className="mut">Nada aqui é salvo no banco ou somado nos valores e formandos do painel.</p>
        </div>
        <div className="row">
          <button onClick={() => { setEnvios([]); setRostos([]); setDupTeste({ formando: '', cpf: '', resp1: '', resultado: null }) }}>Limpar simulação</button>
          <a className="btn" href="/admin">Voltar ao painel</a>
        </div>
      </div>

      <section className="box">
        <h2>Dados da simulação</h2>
        <div className="grid">
          <label>Formando<input value={formando} onChange={e => setFormando(e.target.value)} /></label>
          <label>Responsável<input value={resp1} onChange={e => setResp1(e.target.value)} /></label>
          <label>Forma de pagamento
            <select value={forma} onChange={e => { setForma(e.target.value); setEnvios([]) }}>
              <option value="avista">À vista ({brl(fam.valor)})</option>
              <option value="2x">2x ({brl(fam.valor / 2)} cada)</option>
            </select>
          </label>
        </div>
      </section>

      {parcelas(fam).map(p => (
        <ParcelaTeste
          key={p.n}
          p={p}
          fam={fam}
          cfg={cfg}
          envios={envios}
          onEnviar={novo => setEnvios(prev => [...prev, novo])}
          onSimularStatus={(id, status, motivo = null) => setEnvios(prev => prev.map(x => x.id === id ? { ...x, status, motivo } : x))}
        />
      ))}

      <section className="box">
        <h2>Rostos de referência (teste local)</h2>
        <input type="file" accept="image/*" onChange={addRosto} />
        {!!rostos.length && (
          <div className="galeria" style={{ marginTop: 8 }}>
            {rostos.map(r => (
              <div key={r.id} style={{ display: 'grid', gap: 4 }}>
                <img src={r.url} alt={r.nome} />
                <button onClick={() => setRostos(prev => prev.filter(x => x.id !== r.id))}>Remover</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="box">
        <h2>Galeria de fotos</h2>
        <p className={quitado ? 'okmsg' : 'mut'}>
          {quitado ? 'Simulação quitada: a família veria as fotos liberadas aqui.' : 'As fotos são liberadas após a confirmação do pagamento total.'}
        </p>
      </section>

      <section className="box">
        <h2>Testar trava de cadastro duplicado (somente leitura)</h2>
        <form onSubmit={testarDuplicado} style={{ display: 'grid', gap: 8 }}>
          <div className="grid">
            <label>Nome do formando<input value={dupTeste.formando} onChange={e => setDupTeste({ ...dupTeste, formando: e.target.value })} placeholder="Ex.: Mirella Jurcovichi Martins" /></label>
            <label>CPF do responsável<input value={dupTeste.cpf} onChange={e => setDupTeste({ ...dupTeste, cpf: e.target.value })} placeholder="000.000.000-00" /></label>
            <label>Nome do responsável<input value={dupTeste.resp1} onChange={e => setDupTeste({ ...dupTeste, resp1: e.target.value })} /></label>
          </div>
          <div><button className="p">Testar verificação</button></div>
          {dupTeste.resultado && <p className={/já existe/i.test(dupTeste.resultado) ? 'err' : 'okmsg'}>{dupTeste.resultado}</p>}
        </form>
      </section>
    </main>
  )
}
