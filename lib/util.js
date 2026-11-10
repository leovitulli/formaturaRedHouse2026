import { createClient } from '@supabase/supabase-js'

export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sem-chave'
)

export const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const data = d => d ? new Date(d).toLocaleString('pt-BR') : ''

export function cpfValido(c) {
  c = (c || '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  for (const t of [9, 10]) {
    let s = 0
    for (let i = 0; i < t; i++) s += +c[i] * (t + 1 - i)
    if (((s * 10) % 11) % 10 !== +c[t]) return false
  }
  return true
}

// Parcelas da família: à vista = 1, 2x = duas metades
export function parcelas(f) {
  if (f.forma_pagamento === '2x') {
    const a = Math.round(f.valor / 2 * 100) / 100
    return [{ n: 1, valor: a, quando: 'no aceite' }, { n: 2, valor: f.valor - a, quando: 'até 12/12/2026' }]
  }
  return [{ n: 1, valor: +f.valor, quando: 'no aceite' }]
}

// Encargos por atraso (CDC art. 52 §1º: multa máx. 2%) + juros de mora pro rata
export function encargos(valor, cfg, hoje = new Date()) {
  const venc = new Date((cfg?.vencimento || '2026-12-12') + 'T23:59:59-03:00')
  const dias = Math.floor((hoje - venc) / 86400000) + 1
  if (!cfg || dias <= 0) return { dias: 0, multa: 0, juros: 0, total: +valor }
  const multa = Math.round(valor * (+cfg.multa_pct || 0)) / 100
  const juros = Math.round(valor * (+cfg.juros_mes || 0) / 30 * dias) / 100
  return { dias, multa, juros, total: Math.round((+valor + multa + juros) * 100) / 100 }
}

// Pix "copia e cola" (padrão BR Code do Banco Central)
const campo = (id, v) => id + String(v.length).padStart(2, '0') + v
const limpa = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase()
function crc16(s) {
  let c = 0xffff
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1
  }
  return (c & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}
export function pixPayload({ chave, nome, cidade, valor, txid }) {
  const p = campo('00', '01')
    + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave))
    + campo('52', '0000') + campo('53', '986') + campo('54', (+valor).toFixed(2))
    + campo('58', 'BR') + campo('59', limpa(nome).slice(0, 25)) + campo('60', limpa(cidade).slice(0, 15))
    + campo('62', campo('05', (txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***'))
    + '6304'
  return p + crc16(p)
}
