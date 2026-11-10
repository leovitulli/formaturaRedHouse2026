// Texto oficial da proposta. É exibido na página inicial e gravado, palavra por palavra,
// no aceite de cada família (com hash SHA-256). Ao mudar o texto, troque a VERSAO.
export const VERSAO = '2026-11-10.2'

export function secoes(preco, cfg = {}) {
  const brl = v => (+v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const venc = cfg.vencimento ? new Date(cfg.vencimento + 'T12:00').toLocaleDateString('pt-BR') : '12/12/2026'
  return [
    { t: 'Partes', i: [
      'Contratado: Léo Vitulli, fotógrafo e videomaker, telefone 11 94791-6020.',
      'Contratante: o responsável legal identificado neste cadastro, em nome do formando indicado.',
      'Cliente: grupo de responsáveis pelos formandos da Red House Santana, a/c Fernanda.'] },
    { t: 'O evento', i: [
      'Data: 12/12/2026, das 10h30 às 14h30 (até 4 horas de equipe, incluindo montagem e testes).',
      '11h30 às 12h30: cerimônia de formatura. 12h30 às 13h30: sessão de fotos no auditório.',
      'Local: Red House Arena, R. Emílio Mallet, 1629, Vila Gomes Cardim, São Paulo/SP.',
      'A escola é responsável por liberar a filmagem e a fotografia no local.'] },
    { t: 'O que está incluído', i: [
      'Equipe: 1 fotógrafo e 3 filmmakers, com equipamentos compatíveis.',
      'Vídeo editado e finalizado da cerimônia completa.',
      'Fotos editadas da formatura, da turma, de cada formando e com suas famílias, com seleção e tratamento.',
      'Álbum de fotos para cada formando: capa dura, 20x40 cm.',
      'Galeria digital individual: cada família acessa somente as fotos do seu formando, com login próprio.'] },
    { t: 'Prazos de entrega', i: [
      'Fotos na galeria: até 15 dias úteis após o evento.',
      'Vídeo completo: até 30 dias úteis após o evento.',
      'Álbuns: após a entrega das fotos e o prazo de produção da gráfica.',
      'As fotos digitais são liberadas após a confirmação do pagamento total.'] },
    { t: 'Organização e cuidados', i: [
      'A programação e o acesso da equipe serão alinhados com a organização e a escola.',
      'As fotos individuais e com familiares terão um período reservado dentro do horário contratado.',
      'A equipe testa os equipamentos e mantém cópia de segurança dos arquivos. Imprevistos serão comunicados à organização.',
      'O uso das imagens das crianças na divulgação do trabalho do contratado depende de autorização específica dos responsáveis, marcada no cadastro.',
      'Fotos de rosto enviadas como referência (do formando ou de responsáveis) são usadas apenas para separar automaticamente as fotos da família e apagadas após a entrega.'] },
    { t: 'Valor e pagamento', i: [
      `Valor por formando: ${brl(preco)}.`,
      `Forma: à vista no aceite, ou em 2x (50% no aceite e 50% até ${venc}), via Pix gerado no sistema.`,
      `Valores não pagos até ${venc} terão multa de ${cfg.multa_pct ?? 2}% e juros de ${cfg.juros_mes ?? 1}% ao mês, proporcionais aos dias de atraso (CDC, art. 52, §1º).`] },
  ]
}

export function textoProposta(preco, cfg) {
  return `PROPOSTA DE COBERTURA FOTOGRÁFICA E DE VÍDEO - FORMATURA RED HOUSE 2026 (versão ${VERSAO})\n\n` +
    secoes(preco, cfg).map(s => s.t.toUpperCase() + '\n' + s.i.map(x => '- ' + x).join('\n')).join('\n\n')
}
