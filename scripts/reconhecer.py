"""
Separa as fotos do evento por família usando reconhecimento facial (InsightFace, gratuito).

Como funciona:
  1. Lê os rostos de referência que cada família enviou (formando, mãe, pai ou outro responsável).
  2. Encontra esses rostos em todas as fotos.
  3. Família que só enviou o rosto de um responsável: o script pega as fotos em que o responsável
     aparece, vê qual criança está junto dele com mais frequência, assume que é o formando e
     busca essa criança em todas as outras fotos. Um recorte desse rosto deduzido vai para
     _separadas/_conferir para você confirmar antes de publicar.
  4. Cada foto vai para todas as famílias que aparecem nela.

Uso:
  python3 reconhecer.py /caminho/fotos                 # separa em pastas no seu Mac (revise antes)
  python3 reconhecer.py /caminho/fotos --enviar        # separa e publica na galeria de cada família
  python3 reconhecer.py /caminho/fotos-turma --turma   # fotos coletivas: envia para TODAS as famílias
  python3 reconhecer.py --apagar-selfies               # LGPD: apaga os rostos de referência após a entrega

Precisa do arquivo .env na mesma pasta com SUPABASE_URL e SUPABASE_SERVICE_KEY.
"""
import os, sys, shutil
import numpy as np, cv2
from supabase import create_client
from dotenv import load_dotenv

LIMIAR = 0.42        # semelhança mínima (0 a 1). Aumente se entrar foto de outra pessoa; diminua se faltar foto.
IDADE_CRIANCA = 16   # rostos com idade estimada abaixo disso contam como criança na dedução pelo responsável
EXTS = ('.jpg', '.jpeg', '.png')

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])
args = sys.argv[1:]


def publicar(fid, nome, dados, prefixo=''):
    path = f'{fid}/{prefixo}{nome}'
    sb.storage.from_('fotos').upload(path, dados, {'content-type': 'image/jpeg', 'upsert': 'true'})
    sb.table('fotos').upsert({'familia_id': fid, 'path': path}, on_conflict='path').execute()


# ---------- apagar referências (LGPD) ----------
if '--apagar-selfies' in args:
    ros = sb.table('rostos').select('id,path').execute().data
    antigos = sb.table('familias').select('id,selfie_path').not_.is_('selfie_path', 'null').execute().data
    paths = list({r['path'] for r in ros} | {f['selfie_path'] for f in antigos})
    for i in range(0, len(paths), 100):
        sb.storage.from_('selfies').remove(paths[i:i + 100])
    for r in ros:
        sb.table('rostos').delete().eq('id', r['id']).execute()
    for f in antigos:
        sb.table('familias').update({'selfie_path': None}).eq('id', f['id']).execute()
    print(f'{len(paths)} rostos de referência apagados.')
    sys.exit()

if not args or not os.path.isdir(args[0]):
    sys.exit('Informe a pasta das fotos. Ex.: python3 reconhecer.py ~/Formatura/fotos')
pasta, enviar = args[0], '--enviar' in args
arquivos = sorted(a for a in os.listdir(pasta) if a.lower().endswith(EXTS))
fams = {f['id']: f for f in sb.table('familias').select('id,formando_nome').execute().data}

# ---------- fotos coletivas ----------
if '--turma' in args:
    for nome in arquivos:
        with open(os.path.join(pasta, nome), 'rb') as a:
            dados = a.read()
        for fid in fams:
            publicar(fid, nome, dados, 'turma-')
        print(f'{nome}: enviada para {len(fams)} famílias')
    sys.exit()

from insightface.app import FaceAnalysis
ia = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
ia.prepare(ctx_id=-1, det_size=(1024, 1024))

# ---------- 1. referências ----------
ros = sb.table('rostos').select('familia_id,tipo,path').execute().data
refs = []  # (familia_id, tipo, embedding)
for r in ros:
    img = cv2.imdecode(np.frombuffer(sb.storage.from_('selfies').download(r['path']), np.uint8), cv2.IMREAD_COLOR)
    faces = ia.get(img) if img is not None else []
    nome = fams.get(r['familia_id'], {}).get('formando_nome', '?')
    if not faces:
        print(f'  Nenhum rosto na referência ({r["tipo"]}) de {nome}: peça outra foto.')
        continue
    f = max(faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
    if len(faces) > 1:
        print(f'  Referência ({r["tipo"]}) de {nome} tem {len(faces)} rostos: usei o maior.')
    refs.append((r['familia_id'], r['tipo'], f.normed_embedding))

com_formando = {fid for fid, t, _ in refs if t == 'formando'}
so_resp = {fid for fid, t, _ in refs if t != 'formando'} - com_formando
sem_ref = set(fams) - com_formando - so_resp
print(f'{len(com_formando)} famílias com rosto do formando, {len(so_resp)} só com responsável, {len(sem_ref)} sem referência.')
for fid in sem_ref:
    print(f'  Sem referência (separe manualmente): {fams[fid]["formando_nome"]}')

# ---------- 2. detecta todos os rostos em todas as fotos ----------
fotos = []  # {nome, faces: [{emb, idade, bbox, fid, tipo}]}
for i, nome in enumerate(arquivos, 1):
    img = cv2.imread(os.path.join(pasta, nome))
    if img is None:
        continue
    faces = []
    for f in ia.get(img):
        melhor = max(((float(np.dot(f.normed_embedding, e)), fid, t) for fid, t, e in refs), default=(0, None, None))
        rec = melhor[0] >= LIMIAR
        faces.append({'emb': f.normed_embedding, 'idade': int(getattr(f, 'age', 99) or 99),
                      'bbox': [int(v) for v in f.bbox], 'fid': melhor[1] if rec else None, 'tipo': melhor[2] if rec else None})
    fotos.append({'nome': nome, 'faces': faces})
    print(f'[{i}/{len(arquivos)}] {nome}: {len(faces)} rostos')

# ---------- 3. deduz o formando pelo responsável ----------
conferir = os.path.join(pasta, '_separadas', '_conferir')
for fid in so_resp:
    nome_f = fams[fid]['formando_nome']
    clusters = []  # {centro, fotos:set, idades:list, exemplo:(foto, bbox)}
    for ft in fotos:
        if not any(x['fid'] == fid for x in ft['faces']):
            continue
        for x in ft['faces']:
            if x['fid'] is not None:
                continue
            alvo = None
            for c in clusters:
                if float(np.dot(x['emb'], c['centro'])) >= LIMIAR:
                    alvo = c
                    break
            if alvo is None:
                alvo = {'soma': np.zeros_like(x['emb']), 'fotos': set(), 'idades': [], 'exemplo': (ft['nome'], x['bbox'])}
                clusters.append(alvo)
            alvo['soma'] = alvo['soma'] + x['emb']
            alvo['centro'] = alvo['soma'] / np.linalg.norm(alvo['soma'])
            alvo['fotos'].add(ft['nome'])
            alvo['idades'].append(x['idade'])
    criancas = [c for c in clusters if np.median(c['idades']) < IDADE_CRIANCA] or clusters
    if not criancas:
        print(f'  {nome_f}: responsável não encontrado junto de ninguém. Separe manualmente.')
        continue
    melhor = max(criancas, key=lambda c: len(c['fotos']))
    print(f'  {nome_f}: formando deduzido (junto do responsável em {len(melhor["fotos"])} fotos, idade estimada {int(np.median(melhor["idades"]))}).')
    # recorte para conferência
    os.makedirs(conferir, exist_ok=True)
    img = cv2.imread(os.path.join(pasta, melhor['exemplo'][0]))
    x0, y0, x1, y1 = melhor['exemplo'][1]
    m = int((x1 - x0) * 0.4)
    cv2.imwrite(os.path.join(conferir, f'{nome_f}.jpg'), img[max(0, y0 - m):y1 + m, max(0, x0 - m):x1 + m])
    # marca esse rosto em todas as fotos
    for ft in fotos:
        for x in ft['faces']:
            if x['fid'] is None and float(np.dot(x['emb'], melhor['centro'])) >= LIMIAR:
                x['fid'], x['tipo'] = fid, 'formando'

# ---------- 4. distribui ----------
saida = os.path.join(pasta, '_separadas')
cont = {fid: 0 for fid in fams}
sem = []
for ft in fotos:
    donos = {x['fid'] for x in ft['faces'] if x['fid']}
    if not donos:
        sem.append(ft['nome'])
    origem = os.path.join(pasta, ft['nome'])
    for fid in donos:
        destino = os.path.join(saida, fams[fid]['formando_nome'])
        os.makedirs(destino, exist_ok=True)
        shutil.copy2(origem, destino)
        cont[fid] += 1
        if enviar:
            try:
                with open(origem, 'rb') as a:
                    publicar(fid, ft['nome'], a.read())
            except Exception as e:
                print(f'  erro ao enviar {ft["nome"]}: {e}')
if sem:
    os.makedirs(os.path.join(saida, '_sem_formando'), exist_ok=True)
    for n in sem:
        shutil.copy2(os.path.join(pasta, n), os.path.join(saida, '_sem_formando'))

print('\nResumo:')
for fid, f in sorted(fams.items(), key=lambda x: x[1]['formando_nome']):
    origem = 'formando' if fid in com_formando else 'deduzido pelo responsável' if fid in so_resp else 'sem referência'
    print(f'  {f["formando_nome"]}: {cont[fid]} fotos ({origem})')
if sem:
    print(f'  {len(sem)} fotos sem ninguém reconhecido em _separadas/_sem_formando')
if so_resp:
    print(f'\nConfira os rostos deduzidos em {conferir} antes de usar --enviar.')
print(f'Pastas criadas em: {saida}')
