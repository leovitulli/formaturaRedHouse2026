'use client'
import { useEffect, useState } from 'react'
import { sb, brl } from '@/lib/util'
import { secoes, VERSAO } from '@/lib/proposta'

export default function Proposta() {
  const [cfg, setCfg] = useState({ preco: 630 })
  useEffect(() => { sb.from('config').select('*').single().then(({ data }) => data && setCfg(data)) }, [])

  return (
    <main>
      <div>
        <h1>Proposta de cobertura da formatura</h1>
        <p className="mut">Red House Santana · A/C Fernanda · Grupo de responsáveis pelos formandos · versão {VERSAO}</p>
      </div>

      {secoes(cfg.preco, cfg).map(s => (
        <section className="box" key={s.t}>
          <h2>{s.t}</h2>
          <ul>{s.i.map(x => <li key={x}>{x}</li>)}</ul>
        </section>
      ))}

      <section className="box">
        <h2>Valor por formando</h2>
        <p className="total num">{brl(cfg.preco)}</p>
        <div className="row">
          <a className="btn p" href="/cadastro">Aceitar proposta e cadastrar</a>
          <a className="btn" href="/entrar">Já tenho cadastro</a>
        </div>
      </section>

      <p className="mut">Léo Vitulli · 11 94791-6020</p>
    </main>
  )
}
