'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '@/lib/util'

const LIMIAR = 0.5        // distância máxima entre rostos (menor = mais rigoroso)
const IDADE_CRIANCA = 16  // abaixo disso conta como criança na dedução pelo responsável
const LADO_MAX = 1600     // fotos são reduzidas para isso antes da análise (mais rápido)

let fa = null
async function carregarIA() {
  if (fa) return fa
  fa = await import('@vladmandic/face-api')
  try { await fa.tf.setBackend('webgl') } catch { }
  await fa.tf.ready()
  await Promise.all([
    fa.nets.ssdMobilenetv1.loadFromUri('/models'),
    fa.nets.faceLandmark68Net.loadFromUri('/models'),
    fa.nets.faceRecognitionNet.loadFromUri('/models'),
    fa.nets.ageGenderNet.loadFromUri('/models')])
  return fa
}

async function paraCanvas(blob, lado) {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, lado / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c
}
function miniatura(canvas, lado = 260) {
  const k = lado / Math.max(canvas.width, canvas.height)
  const c = document.createElement('canvas')
  c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k)
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.7)
}
function recorte(canvas, b) {
  const m = b.width * 0.4, x = Math.max(0, b.x - m), y = Math.max(0, b.y - m)
  const w = Math.min(canvas.width - x, b.width + 2 * m), h = Math.min(canvas.height - y, b.height + 2 * m)
  const c = document.createElement('canvas'); c.width = 120; c.height = 120
  c.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, 120, 120)
  return c.toDataURL('image/jpeg', 0.8)
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d } return Math.sqrt(s) }
const media = arr => { const m = new Float32Array(arr[0].length); for (const a of arr) for (let i = 0; i < m.length; i++) m[i] += a[i] / arr.length; return m }

export default function Reconhecimento() {
  const [acesso, setAcesso] = useState(null)
  const [fams, setFams] = useState({})
  const [fase, setFase] = useState('inicio')
  const [msg, setMsg] = useState('')
  const [prog, setProg] = useState([0, 0])
  const [fotos, setFotos] = useState([])
  const [semRef, setSemRef] = useState([])
  const [deduz, setDeduz] = useState({})
  const [excl, setExcl] = useState({})
  const [manual, setManual] = useState({})
  const [erro, setErro] = useState('')
  const input = useRef()

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession()
      if (!session) return (location.href = '/entrar')
      const { data: adm } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
      if (!adm) return setAcesso(false)
      const { data } = await sb.from('familias').select('id,formando_nome').order('formando_nome')
      setFams(Object.fromEntries((data || []).map(f => [f.id, f])))
      setAcesso(true)
    })()
  }, [])

  async function processar(arquivos) {
    setErro('')
    if (!arquivos.length) return setErro('Selecione as fotos do evento.')
    try {
      setFase('processando'); setMsg('Carregando a inteligência de reconhecimento…')
      const ia = await carregarIA()
      const opc = new ia.SsdMobilenetv1Options({ minConfidence: 0.4, maxResults: 60 })

      // 1. Rostos de referência
      setMsg('Lendo os rostos de referência das famílias…')
      const { data: ros } = await sb.from('rostos').select('familia_id,tipo,path')
      const refs = []
      for (const r of ros || []) {
        const { data: u } = await sb.storage.from('selfies').createSignedUrl(r.path, 600)
        if (!u) continue
        const cv = await paraCanvas(await (await fetch(u.signedUrl)).blob(), 1000)
        const det = await ia.detectAllFaces(cv, opc).withFaceLandmarks().withFaceDescriptors()
        if (!det.length) continue
        const f = det.sort((a, b) => b.detection.box.area - a.detection.box.area)[0]
        refs.push({ fid: r.familia_id, tipo: r.tipo, desc: f.descriptor })
      }
      const comForm = new Set(refs.filter(r => r.tipo === 'formando').map(r => r.fid))
      const soResp = new Set(refs.filter(r => r.tipo !== 'formando' && !comForm.has(r.fid)).map(r => r.fid))
      setSemRef(Object.keys(fams).filter(id => !comForm.has(id) && !soResp.has(id)))

      // 2. Todas as fotos
      const lista = []
      for (let i = 0; i < arquivos.length; i++) {
        setProg([i + 1, arquivos.length]); setMsg(`Analisando ${arquivos[i].name}`)
        try {
          const cv = await paraCanvas(arquivos[i], LADO_MAX)
          const det = await ia.detectAllFaces(cv, opc).withFaceLandmarks().withFaceDescriptors().withAgeAndGender()
          const faces = det.map(d => {
            let melhor = null
            for (const r of refs) { const x = dist(d.descriptor, r.desc); if (x < LIMIAR && (!melhor || x < melhor.x)) melhor = { x, fid: r.fid, tipo: r.tipo } }
            return { desc: d.descriptor, idade: d.age, box: d.detection.box, fid: melhor?.fid || null, tipo: melhor?.tipo || null, crop: null, cv }
          })
          // guarda recorte só de rostos sem dono (candidatos à dedução)
          for (const f of faces) if (!f.fid) f.crop = recorte(cv, f.box)
          faces.forEach(f => delete f.cv)
          lista.push({ id: i, file: arquivos[i], nome: arquivos[i].name, thumb: miniatura(cv), faces })
        } catch { lista.push({ id: i, file: arquivos[i], nome: arquivos[i].name, thumb: '', faces: [] }) }
        if (i % 5 === 0) await new Promise(r => setTimeout(r))
      }

      // 3. Dedução do formando pelo responsável
      const ded = {}
      for (const fid of soResp) {
        const clusters = []
        for (const ft of lista) {
          if (!ft.faces.some(x => x.fid === fid)) continue
          for (const x of ft.faces) {
            if (x.fid) continue
            let c = clusters.find(c => dist(x.desc, c.centro) < LIMIAR)
            if (!c) { c = { descs: [], fotos: new Set(), idades: [], crop: x.crop }; clusters.push(c) }
            c.descs.push(x.desc); c.centro = media(c.descs); c.fotos.add(ft.id); c.idades.push(x.idade)
          }
        }
        const med = a => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]
        const cand = clusters.filter(c => med(c.idades) < IDADE_CRIANCA)
        const pool = cand.length ? cand : clusters
        if (!pool.length) continue
        const m = pool.sort((a, b) => b.fotos.size - a.fotos.size)[0]
        let n = 0
        for (const ft of lista) for (const x of ft.faces) if (!x.fid && dist(x.desc, m.centro) < LIMIAR) { x.fid = fid; x.tipo = 'deduzido'; n++ }
        ded[fid] = { crop: m.crop, juntos: m.fotos.size, idade: Math.round(med(m.idades)), aceito: true, n }
      }
      lista.forEach(ft => ft.faces.forEach(x => { delete x.desc; delete x.crop }))
      setDeduz(ded); setFotos(lista); setExcl({}); setManual({})
      setFase('revisao')
    } catch (e) {
      setFase('inicio'); setErro('Não foi possível rodar o reconhecimento neste navegador. Use o Chrome atualizado em um computador. (' + (e.message || e) + ')')
    }
  }

  // Destinos finais de cada foto
  const destinos = useMemo(() => {
    const out = {}
    for (const ft of fotos) {
      const s = new Set()
      for (const x of ft.faces) {
        if (!x.fid) continue
        if (x.tipo === 'deduzido' && !deduz[x.fid]?.aceito) continue
        if (!excl[ft.id + '|' + x.fid]) s.add(x.fid)
      }
      const m = manual[ft.id]
      if (m === 'turma') Object.keys(fams).forEach(id => s.add(id))
      else if (m) s.add(m)
      out[ft.id] = s
    }
    return out
  }, [fotos, deduz, excl, manual, fams])

  const porFamilia = useMemo(() => {
    const o = Object.fromEntries(Object.keys(fams).map(id => [id, []]))
    for (const ft of fotos) for (const fid of destinos[ft.id] || []) o[fid]?.push(ft)
    return o
  }, [fotos, destinos, fams])
  const soltas = fotos.filter(ft => !ft.faces.some(x => x.fid && !(x.tipo === 'deduzido' && !deduz[x.fid]?.aceito)))

  async function publicar() {
    const tarefas = []
    for (const ft of fotos) for (const fid of destinos[ft.id]) tarefas.push([ft, fid])
    if (!tarefas.length) return setErro('Nenhuma foto atribuída a uma família.')
    setFase('publicando'); let ok = 0, falhas = 0
    for (let i = 0; i < tarefas.length; i++) {
      const [ft, fid] = tarefas[i]
      setProg([i + 1, tarefas.length])
      const path = `${fid}/${(manual[ft.id] === 'turma' ? 'turma-' : '') + ft.nome.replace(/[^\w.-]/g, '_')}`
      const { error } = await sb.storage.from('fotos').upload(path, ft.file, { contentType: ft.file.type || 'image/jpeg' })
      const jaExiste = error && /exists|duplicate/i.test(error.message)
      if (error && !jaExiste) { falhas++; continue }
      const r = await sb.from('fotos').upsert({ familia_id: fid, path }, { onConflict: 'path' })
      r.error ? falhas++ : ok++
    }
    setMsg(`${ok} fotos publicadas${falhas ? `, ${falhas} com erro (tente publicar de novo; as já enviadas são ignoradas)` : ''}.`)
    setFase('fim')
  }

  if (acesso === null) return <main><p className="mut">Carregando…</p></main>
  if (!acesso) return <main><h1>Acesso restrito</h1></main>
  const nome = id => fams[id]?.formando_nome || '?'

  return (
    <main>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Separar fotos por reconhecimento</h1>
        <a className="btn" href="/admin">Voltar ao painel</a>
      </div>

      {fase === 'inicio' && <section className="box">
        <p>Selecione as fotos tratadas do evento (JPG). O reconhecimento roda <b>neste computador</b>, pelo navegador. Nada é publicado antes da sua conferência.</p>
        <ol className="mut" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Selecione as fotos (pode ser a pasta inteira, centenas de uma vez).</li>
          <li>Espere a análise. Mantenha esta aba aberta; leva cerca de 0,5 s por foto.</li>
          <li>Confira cada formando, tire o que estiver errado e distribua as fotos soltas.</li>
          <li>Clique em <b>Publicar</b>.</li>
        </ol>
        <input ref={input} type="file" accept="image/jpeg,image/png" multiple hidden onChange={e => processar([...e.target.files])} />
        <div><button className="p" onClick={() => input.current.click()}>Selecionar fotos</button></div>
        {erro && <p className="err">{erro}</p>}
        <p className="mut">Use o Chrome em um computador. {Object.keys(fams).length} famílias cadastradas.</p>
      </section>}

      {(fase === 'processando' || fase === 'publicando') && <section className="box">
        <h2>{fase === 'processando' ? 'Analisando fotos' : 'Publicando nas galerias'}</h2>
        <div style={{ height: 12, borderRadius: 6, background: 'var(--line)', overflow: 'hidden' }}><div style={{ height: '100%', width: (prog[1] ? prog[0] / prog[1] * 100 : 3) + '%', background: 'var(--acc)', transition: 'width .2s' }} /></div>
        <p className="mut num">{prog[1] ? `${prog[0]} de ${prog[1]}` : ''} · {fase === 'processando' ? msg : 'enviando arquivos'}</p>
        <p className="mut">Não feche esta aba.</p>
      </section>}

      {fase === 'fim' && <section className="box">
        <h2>Pronto</h2><p>{msg}</p>
        <div className="row"><a className="btn p" href="/admin">Ver no painel</a><button onClick={() => { setFase('inicio'); setFotos([]) }}>Separar outro lote</button></div>
      </section>}

      {fase === 'revisao' && <>
        <section className="box">
          <div className="cards">
            <div className="card"><small>Fotos analisadas</small><b className="num">{fotos.length}</b></div>
            <div className="card"><small>Com formando reconhecido</small><b className="num" style={{ color: 'var(--ok)' }}>{fotos.length - soltas.length}</b></div>
            <div className="card"><small>Soltas (distribuir)</small><b className="num" style={{ color: 'var(--warn)' }}>{soltas.length}</b></div>
          </div>
          {!!semRef.length && <p className="mut">Sem rosto de referência: {semRef.map(nome).join(', ')}. Distribua as fotos delas pelas soltas.</p>}
          {erro && <p className="err">{erro}</p>}
          <div className="row"><button className="p" onClick={publicar}>Publicar nas galerias</button><button onClick={() => setFase('inicio')}>Recomeçar</button></div>
        </section>

        {Object.keys(fams).map(fid => {
          const lista = porFamilia[fid] || [], d = deduz[fid]
          return (
            <section className="box" key={fid}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>{nome(fid)}</h2>
                <span className={'pill ' + (lista.length ? 'ok' : 'pe')}>{lista.length} fotos</span>
              </div>
              {d && <div className="row" style={{ background: 'var(--warnbg)', borderRadius: 10, padding: 10 }}>
                <img src={d.crop} alt="Rosto deduzido" width="72" height="72" style={{ borderRadius: 36, objectFit: 'cover' }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <b style={{ color: 'var(--warn)' }}>Este é {nome(fid).split(' ')[0]}?</b>
                  <div className="mut">Deduzido pelo responsável: juntos em {d.juntos} foto(s), idade estimada {d.idade}.</div>
                </div>
                <label className="chk"><input type="checkbox" checked={d.aceito} onChange={e => setDeduz({ ...deduz, [fid]: { ...d, aceito: e.target.checked } })} /> Sim, usar</label>
              </div>}
              {!!lista.length && <div className="galeria">{lista.map(ft => (
                <div key={ft.id} style={{ position: 'relative' }}>
                  <a href={ft.thumb} target="_blank" rel="noreferrer"><img src={ft.thumb} alt={ft.nome} /></a>
                  <button title="Tirar desta família" onClick={() => {
                    if (manual[ft.id] === fid) setManual({ ...manual, [ft.id]: '' })
                    else setExcl({ ...excl, [ft.id + '|' + fid]: true })
                  }} style={{ position: 'absolute', top: 4, right: 4, padding: '2px 8px', fontSize: 12, background: 'rgba(0,0,0,.65)', color: '#fff', border: 'none' }}>tirar</button>
                </div>))}</div>}
            </section>)
        })}

        <section className="box">
          <h2>Fotos soltas ({soltas.length})</h2>
          <p className="mut">Nenhum formando reconhecido. Escolha o destino: uma família, a turma toda (vai para todas) ou deixe de fora.</p>
          <div className="galeria">{soltas.map(ft => (
            <div key={ft.id} style={{ display: 'grid', gap: 4 }}>
              <a href={ft.thumb} target="_blank" rel="noreferrer"><img src={ft.thumb} alt={ft.nome} /></a>
              <select value={manual[ft.id] || ''} onChange={e => setManual({ ...manual, [ft.id]: e.target.value })} style={{ fontSize: 12.5, padding: 5 }}>
                <option value="">Deixar de fora</option>
                <option value="turma">Turma (todas)</option>
                {Object.keys(fams).map(id => <option key={id} value={id}>{nome(id)}</option>)}
              </select>
            </div>))}</div>
        </section>

        <section className="box leg">
          <h2 style={{ color: 'var(--fg)' }}>Legenda</h2>
          <div><b>Com formando reconhecido</b>: fotos em que o sistema achou pelo menos um formando (ou o responsável dele). Uma foto com vários formandos vai para todos.</div>
          <div><b>Soltas</b>: ninguém reconhecido (rosto de lado, longe, turma). Escolha o destino em cada uma.</div>
          <div><span className="pill pa">Este é …?</span> família que enviou só o rosto do responsável: o sistema achou a criança que mais aparece ao lado dele. Desmarque "Sim, usar" se estiver errado.</div>
          <div><b>tirar</b>: remove a foto só daquela família. <b>Publicar</b>: envia para as galerias; repetir não duplica fotos.</div>
        </section>
      </>}
    </main>
  )
}
