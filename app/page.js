'use client'
import { useEffect, useState } from 'react'
import { sb, brl } from '@/lib/util'

export default function Proposta() {
  const [preco, setPreco] = useState(630)
  useEffect(() => { sb.from('config').select('preco').single().then(({ data }) => data && setPreco(data.preco)) }, [])

  return (
    <main>
      <div>
        <h1>Proposta de cobertura da formatura</h1>
        <p className="mut">Red House Santana · A/C Fernanda · Grupo de responsáveis pelos formandos</p>
      </div>

      <section className="box">
        <h2>O evento</h2>
        <ul>
          <li>Data: <b>12/12/2026</b>, das 10h30 às 14h30 (até 4 horas de equipe, incluindo montagem e testes).</li>
          <li>11h30 às 12h30: cerimônia de formatura · 12h30 às 13h30: sessão de fotos no auditório.</li>
          <li>Local: Red House Arena, R. Emílio Mallet, 1629, Vila Gomes Cardim, São Paulo/SP.</li>
          <li>A escola é responsável por liberar a filmagem e a fotografia no local.</li>
        </ul>
      </section>

      <section className="box">
        <h2>O que está incluído</h2>
        <ul>
          <li>Equipe: 1 fotógrafo e 3 filmmakers, com equipamentos compatíveis.</li>
          <li>Vídeo editado e finalizado da cerimônia completa.</li>
          <li>Fotos editadas da formatura, da turma, de cada formando e com suas famílias, com seleção e tratamento.</li>
          <li>Álbum de fotos para cada formando: capa dura, 20x40 cm.</li>
          <li>Galeria digital individual: cada família acessa somente as fotos do seu formando, com login próprio.</li>
        </ul>
      </section>

      <section className="box">
        <h2>Prazos de entrega</h2>
        <ul>
          <li>Fotos na galeria: até 15 dias úteis após o evento.</li>
          <li>Vídeo completo: até 30 dias úteis após o evento.</li>
          <li>Álbuns: após a entrega das fotos e o prazo de produção da gráfica.</li>
        </ul>
      </section>

      <section className="box">
        <h2>Organização e cuidados</h2>
        <ul>
          <li>A programação e o acesso da equipe serão alinhados com a organização e a escola.</li>
          <li>As fotos individuais e com familiares terão um período reservado dentro do horário contratado.</li>
          <li>A equipe testa os equipamentos e mantém cópia de segurança dos arquivos. Imprevistos serão comunicados à organização.</li>
          <li>O uso das imagens das crianças na divulgação do nosso trabalho depende de autorização específica dos responsáveis, marcada no cadastro.</li>
          <li>Se autorizado, a foto do rosto do formando enviada no cadastro é usada apenas para separar automaticamente as fotos dele, e é apagada após a entrega.</li>
        </ul>
      </section>

      <section className="box">
        <h2>Valor por formando</h2>
        <p className="total num">{brl(preco)}</p>
        <p className="mut">À vista no aceite, ou em 2x: 50% no aceite e 50% até o dia do evento (12/12/2026), via Pix gerado no sistema. Valores não pagos até a data do evento terão multa de 2% e juros de 1% ao mês, proporcionais aos dias de atraso.</p>
        <div className="row">
          <a className="btn p" href="/cadastro">Aceitar proposta e cadastrar</a>
          <a className="btn" href="/entrar">Já tenho cadastro</a>
        </div>
      </section>

      <p className="mut">Léo Vitulli · 11 94791-6020</p>
    </main>
  )
}
