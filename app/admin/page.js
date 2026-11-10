'use client'
import { useEffect, useState } from 'react'
import { sb, brl, data } from '@/lib/util'

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
        <span className={'pill ' + st[0]}>{st[1]}</span>
        <span className="num">{brl(pago)} / {brl(f.valor)}</span>
        <span className="mut">{f.forma_pagamento === '2x' ? '2x' : 'À vista'}</span>
        <span className={'pill ' + (rostos.some(r => r.tipo === 'formando') ? 'ok' : rostos.length ? 'pa' : 'pe')}>Rosto {rostos.some(r => r.tipo === 'formando') ? 'formando' : rostos.length ? 'só responsável' : 'não'}</span>
        <span className={'pill ' + (f.aceite_portfolio ? 'ok' : 'pe')}>Portfólio {f.aceite_portfolio ? 'sim' : 'não'}</span>
        <span className="mut num">{nFotos} fotos</span>
        <button onClick={() => setAberta(!aberta)}>{aberta ? 'Fechar' : 'Detalhes'}</button>
      </div>
      {aberta && <div className="box">
        <p>Responsável: <b>{f.resp1_nome}</b> ({f.resp1_parentesco}) · CPF {f.resp1_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
        {f.resp2_nome && <p>Segundo responsável: <b>{f.resp2_nome}</b> ({f.resp2_parentesco})</p>}
        <p>{f.email} · {f.telefone}</p>
        <p className="mut">Aceite assinado em {data(f.aceite_em)} · {f.aceite_navegador}</p>
        {!!rostos.length && <div className="row"><span className="mut">Rostos de referência:</span>{rostos.map(r => <button key={r.id} onClick={() => abrir('selfies', r.path)}>{({ formando: 'Formando', mae: 'Mãe', pai: 'Pai', responsavel: 'Responsável' })[r.tipo]}</button>)}</div>}
        <h2>Comprovantes</h2>
        {!env.length && <p className="mut">Nenhum comprovante enviado.</p>}
        {env.sort((a, b) => a.criado_em.localeCompare(b.criado_em)).map(p => (
          <div key={p.id} className="row">
            <span className="num">Parcela {p.parcela} · {brl(p.valor)} · {data(p.criado_em)}</span>
            <span className={'pill ' + ({ enviado: 'an', confirmado: 'ok', recusado: 'pe' })[p.status]}>{({ enviado: 'Em análise', confirmado: 'Confirmado', recusado: 'Pendente' })[p.status]}</span>
            <button onClick={() => abrir('comprovantes', p.comprovante_path)}>Ver</button>
            {p.status !== 'confirmado' && <button className="p" onClick={() => revisar(p.id, 'confirmado')}>Confirmar</button>}
            {p.status !== 'recusado' && <PedirNovo onOk={m => revisar(p.id, 'recusado', m)} />}
            {p.status === 'recusado' && p.motivo && <span className="mut">Pedido: {p.motivo}</span>}
          </div>))}
        <h2>Fotos do formando</h2>
        <label>Enviar fotos manualmente (pode selecionar várias)<input type="file" accept="image/*" multiple onChange={enviarFotos} /></label>
        {up && <p className="mut">{up}</p>}
        <div><BotaoConfirmar txt="Excluir cadastro" onOk={apagar} /></div>
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
  const conf = pags.filter(p => p.status === 'confirmado').reduce((s, p) => s + +p.valor, 0)
  const anal = pags.filter(p => p.status === 'enviado').reduce((s, p) => s + +p.valor, 0)
  const contr = fams.reduce((s, f) => s + +f.valor, 0)
  const custo = +cfg.custo_fixo + +cfg.custo_album * fams.length
  const cor = v => ({ color: v < 0 ? 'var(--bad)' : 'var(--ok)' })
  const c = k => e => setCfg({ ...cfg, [k]: e.target.value })

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Painel da formatura</h1>
        <div className="row"><button onClick={carregar}>Atualizar</button><button onClick={async () => { await sb.auth.signOut(); location.href = '/' }}>Sair</button></div>
      </div>

      <div className="cards">
        <div className="card"><small>Famílias cadastradas</small><b className="num">{fams.length}</b></div>
        <div className="card"><small>Contratado</small><b className="num">{brl(contr)}</b></div>
        <div className="card"><small>Recebido</small><b className="num" style={{ color: 'var(--ok)' }}>{brl(conf)}</b></div>
        <div className="card"><small>Em análise</small><b className="num" style={{ color: 'var(--info)' }}>{brl(anal)}</b></div>
        <div className="card"><small>A receber</small><b className="num" style={{ color: 'var(--warn)' }}>{brl(Math.max(contr - conf, 0))}</b></div>
        <div className="card"><small>Custo do evento</small><b className="num" style={{ color: 'var(--bad)' }}>{brl(custo)}</b></div>
        <div className="card"><small>Lucro hoje</small><b className="num" style={cor(conf - custo)}>{brl(conf - custo)}</b></div>
        <div className="card"><small>Lucro previsto</small><b className="num" style={cor(contr - custo)}>{brl(contr - custo)}</b></div>
      </div>

      <section className="box">
        <h2>Formandos</h2>
        {!fams.length ? <p className="mut">Nenhuma família cadastrada ainda. Envie o link da proposta para os pais.</p>
          : fams.map(f => <Familia key={f.id} f={f} env={pags.filter(p => p.familia_id === f.id)} nFotos={fotos.filter(x => x.familia_id === f.id).length} rostos={rostos.filter(r => r.familia_id === f.id)} recarregar={carregar} />)}
      </section>

      <form className="box" onSubmit={salvarCfg}>
        <h2>Configuração</h2>
        <div className="grid">
          <label>Preço por formando (novos cadastros)<input type="number" value={cfg.preco} onChange={c('preco')} /></label>
          <label>Chave Pix<input value={cfg.pix_chave} onChange={c('pix_chave')} /></label>
          <label>Nome do favorecido<input value={cfg.pix_nome} onChange={c('pix_nome')} /></label>
          <label>Cidade do favorecido<input value={cfg.pix_cidade} onChange={c('pix_cidade')} /></label>
          <label>Custo fixo (equipe, áudio, extras)<input type="number" value={cfg.custo_fixo} onChange={c('custo_fixo')} /></label>
          <label>Custo de cada álbum<input type="number" value={cfg.custo_album} onChange={c('custo_album')} /></label>
          <label>Vencimento final (multa após)<input type="date" value={cfg.vencimento || ''} onChange={c('vencimento')} /></label>
          <label>Multa por atraso (%, máx. 2 pelo CDC)<input type="number" step="0.1" min="0" max="2" value={cfg.multa_pct} onChange={c('multa_pct')} /></label>
          <label>Juros de mora (% ao mês)<input type="number" step="0.1" min="0" max="1" value={cfg.juros_mes} onChange={c('juros_mes')} /></label>
        </div>
        <div className="row"><button className="p">Salvar</button>{salvo && <span className="okmsg">Salvo.</span>}</div>
      </form>

      <section className="box leg">
        <h2 style={{ color: 'var(--fg)' }}>Legenda</h2>
        <div><b>Contratado</b>: soma do valor de todas as famílias cadastradas.</div>
        <div><b>Recebido</b>: soma dos comprovantes que você confirmou.</div>
        <div><b>Em análise</b>: comprovantes enviados que você ainda não conferiu no extrato.</div>
        <div><b>A receber</b>: contratado menos recebido.</div>
        <div><b>Custo do evento</b>: custo fixo + custo do álbum × famílias cadastradas.</div>
        <div><b>Lucro hoje</b>: recebido menos custo. <b>Lucro previsto</b>: contratado menos custo, se todos pagarem.</div>
        <div><span className="pill ok">Quitado</span> pagou tudo · <span className="pill an">Comprovante em análise</span> tem comprovante para conferir · <span className="pill pa">Parcial</span> pagou a 1ª parcela · <span className="pill pe">Pendente</span> nada pago.</div>
        <div><span className="pill ok">Rosto formando</span> tem foto do formando: reconhecimento direto. <span className="pill pa">Rosto só responsável</span> o script acha o responsável e deduz o formando ao lado dele (confira em _conferir). <span className="pill pe">Rosto não</span> sem referência: separe manualmente ou peça para a família enviar pela área dela.</div>
        <div><span className="pill ok">Portfólio sim</span> pode usar as imagens do formando na sua divulgação.</div>
        <div><b>Confirmar</b>: confira o valor no extrato do banco antes de clicar. <b>Pedir novo comprovante</b>: escolha o motivo; o status volta para <span className="pill pe">Pendente</span>, a família vê o motivo e o QR Code volta a aparecer para ela enviar outro. <b>Excluir</b> pede um segundo clique.</div>
        <div><b>Multa e juros</b>: após o vencimento final, cada parcela em aberto passa a mostrar valor + multa + juros proporcionais aos dias. O comprovante chega com o valor que a família viu; confira esse valor no extrato.</div>
        <div>A família só vê as fotos depois que o valor total estiver confirmado.</div>
      </section>
    </main>
  )
}
