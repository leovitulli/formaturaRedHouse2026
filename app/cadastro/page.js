'use client'
import { useEffect, useState } from 'react'
import { sb, cpfValido } from '@/lib/util'

export default function Cadastro() {
  const [f, setF] = useState({ forma: 'avista', p1: 'Mãe', p2: 'Pai' })
  const [logado, setLogado] = useState(null)
  useEffect(() => {
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      // Confere no servidor se o login ainda existe (ex.: usuário apagado no painel)
      const { data: u, error } = await sb.auth.getUser()
      if (error || !u?.user) { await sb.auth.signOut(); return }
      const { data: fam } = await sb.from('familias').select('id').eq('user_id', u.user.id).maybeSingle()
      if (fam) location.href = '/minha-area'
      else setLogado(u.user)
    })
  }, [])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const s = k => e => { setErro(''); setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'file' ? e.target.files[0] : e.target.value }) }

  async function enviar(e) {
    e.preventDefault()
    const nome = v => (v || '').trim().split(/\s+/).length >= 2
    if (!nome(f.formando)) return setErro('Digite o nome completo do formando (nome e sobrenome).')
    if (!nome(f.r1)) return setErro('Digite o nome completo do responsável.')
    if (!cpfValido(f.cpf)) return setErro('CPF do responsável inválido.')
    if (f.r2 && !nome(f.r2)) return setErro('Digite o nome completo do segundo responsável ou deixe em branco.')
    if (!logado && !/\S+@\S+\.\S+/.test(f.email || '')) return setErro('Digite um e-mail válido.')
    if ((f.tel || '').replace(/\D/g, '').length < 10) return setErro('Digite um telefone com DDD.')
    if (!logado && (f.senha || '').length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    if (!f.aceite) return setErro('Para continuar, marque que leu e aceita a proposta.')
    if (f.bio && !f.selfie) return setErro('Envie uma foto do rosto do formando ou desmarque a autorização de reconhecimento.')

    setEnviando(true)
    try {
      let user = logado
      if (!user) {
        const email = f.email.trim()
        let { data: auth, error: e1 } = await sb.auth.signUp({ email, password: f.senha })
        if (e1 && /registered|exists/i.test(e1.message)) {
          // Login já existe (ex.: confirmou o e-mail antes): entra com a mesma senha e completa o cadastro
          const r = await sb.auth.signInWithPassword({ email, password: f.senha })
          if (r.error) throw new Error('Este e-mail já tem login com outra senha. Use "Entrar" e depois volte aqui.')
          auth = r.data; e1 = null
        }
        if (e1) throw e1
        if (!auth.session) throw new Error('Enviamos um e-mail de confirmação. Confirme, entre no sistema e o cadastro continua daqui.')
        user = auth.user
      }
      const uid = user.id
      const email = logado ? logado.email : f.email.trim()
      let selfie_path = null
      if (f.bio && f.selfie) {
        selfie_path = `${uid}/formando.${f.selfie.name.split('.').pop()}`
        const { error } = await sb.storage.from('selfies').upload(selfie_path, f.selfie, { upsert: true })
        if (error) throw new Error('Não foi possível enviar a foto. Tente de novo.')
      }
      const { error: e2 } = await sb.from('familias').insert({
        formando_nome: f.formando.trim(), resp1_nome: f.r1.trim(), resp1_cpf: f.cpf.replace(/\D/g, ''), resp1_parentesco: f.p1,
        resp2_nome: f.r2?.trim() || null, resp2_parentesco: f.r2 ? f.p2 : null,
        email, telefone: f.tel, forma_pagamento: f.forma,
        aceite_proposta: true, aceite_biometria: !!f.bio, aceite_portfolio: !!f.port,
        aceite_navegador: navigator.userAgent.slice(0, 300), selfie_path
      })
      if (e2) throw new Error('Não foi possível salvar o cadastro. Tente de novo.')
      if (selfie_path) {
        const { data: fam } = await sb.from('familias').select('id').eq('user_id', uid).single()
        if (fam) await sb.from('rostos').insert({ familia_id: fam.id, tipo: 'formando', path: selfie_path, consentimento: true })
      }
      location.href = '/minha-area'
    } catch (err) { setErro(/load failed|failed to fetch|network/i.test(err.message) ? 'Sem conexão com o servidor. Verifique a internet e o arquivo .env.local.' : err.message) } finally { setEnviando(false) }
  }

  const par = k => <select value={f[k]} onChange={s(k)}><option>Mãe</option><option>Pai</option><option>Avó</option><option>Avô</option><option>Responsável legal</option></select>

  return (
    <main>
      <div><h1>Aceite da proposta</h1><p className="mut">Preencha os dados para assinar a proposta e gerar o pagamento. <a href="/">Rever proposta</a></p></div>
      <form className="box" onSubmit={enviar} noValidate>
        <h2>Formando</h2>
        <label>Nome completo do formando<input value={f.formando || ''} onChange={s('formando')} autoComplete="off" /></label>

        <h2>Responsável que assina</h2>
        <div className="grid">
          <label>Nome completo<input value={f.r1 || ''} onChange={s('r1')} autoComplete="name" /></label>
          <label>CPF<input value={f.cpf || ''} onChange={s('cpf')} inputMode="numeric" placeholder="000.000.000-00" /></label>
          <label>Parentesco{par('p1')}</label>
        </div>

        <h2>Segundo responsável (opcional)</h2>
        <div className="grid">
          <label>Nome completo<input value={f.r2 || ''} onChange={s('r2')} /></label>
          <label>Parentesco{par('p2')}</label>
        </div>

        <h2>Contato e acesso</h2>
        {logado && <p className="mut">Você já entrou como <b>{logado.email}</b>. Complete os dados abaixo.</p>}
        <div className="grid">
          {!logado && <label>E-mail (será seu login)<input type="email" value={f.email || ''} onChange={s('email')} autoComplete="email" /></label>}
          <label>Telefone com DDD<input value={f.tel || ''} onChange={s('tel')} inputMode="tel" placeholder="11 99999-9999" /></label>
          {!logado && <label>Crie uma senha<input type="password" value={f.senha || ''} onChange={s('senha')} autoComplete="new-password" /></label>}
        </div>

        <h2>Pagamento</h2>
        <label>Forma<select value={f.forma} onChange={s('forma')}><option value="avista">À vista no aceite</option><option value="2x">2x: 50% agora e 50% até 12/12/2026</option></select></label>

        <h2>Autorizações</h2>
        <label className="chk"><input type="checkbox" checked={!!f.aceite} onChange={s('aceite')} /> Li e aceito a proposta, os prazos, o valor por formando e a multa de 2% mais juros de 1% ao mês em caso de atraso após a data do evento. (obrigatório)</label>
        <label className="chk"><input type="checkbox" checked={!!f.bio} onChange={s('bio')} /> Autorizo o uso de uma foto do rosto do formando apenas para separar automaticamente as fotos dele. A foto é apagada após a entrega. (opcional, dá para enviar depois, inclusive o rosto de um responsável no lugar)</label>
        {f.bio && <label>Foto do rosto do formando, de frente e com boa luz<input type="file" accept="image/*" onChange={s('selfie')} /></label>}
        <label className="chk"><input type="checkbox" checked={!!f.port} onChange={s('port')} /> Autorizo o uso de imagens do formando na divulgação do trabalho do Léo Vitulli (portfólio e redes). (opcional)</label>

        {erro && <p className="err" role="alert">{erro}</p>}
        <div><button className="p" disabled={enviando}>{enviando ? 'Enviando…' : 'Assinar e ir para o pagamento'}</button></div>
        <p className="mut">Ao assinar, registramos data, hora e navegador do aceite como assinatura eletrônica.</p>
      </form>
    </main>
  )
}
