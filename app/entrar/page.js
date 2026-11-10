'use client'
import { useState } from 'react'
import { sb } from '@/lib/util'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  async function entrar(e) {
    e.preventDefault(); setErro('')
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) return setErro(/fetch|network|load failed/i.test(error.message) || error.status === 0 ? 'Sem conexão com o servidor de login. Avise o Léo.' : 'E-mail ou senha incorretos.')
    const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle()
    location.href = adm ? '/admin' : '/minha-area'
  }
  async function esqueci() {
    if (!email) return setErro('Digite seu e-mail primeiro.')
    await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/entrar' })
    setMsg('Enviamos um link para redefinir a senha.')
  }

  return (
    <main>
      <h1>Entrar</h1>
      <form className="box" onSubmit={entrar} style={{ maxWidth: 420 }}>
        <label>E-mail<input type="email" value={email} onChange={e => { setEmail(e.target.value); setErro('') }} autoComplete="email" /></label>
        <label>Senha<input type="password" value={senha} onChange={e => { setSenha(e.target.value); setErro('') }} autoComplete="current-password" /></label>
        {erro && <p className="err">{erro}</p>}{msg && <p className="okmsg">{msg}</p>}
        <div className="row"><button className="p">Entrar</button><button type="button" onClick={esqueci}>Esqueci a senha</button></div>
        <p className="mut">Ainda não aceitou a proposta? <a href="/cadastro">Cadastre-se</a></p>
      </form>
    </main>
  )
}
