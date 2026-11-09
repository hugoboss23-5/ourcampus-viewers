"""Recover the already public campus study and progress routes."""
import hashlib
import json
import shutil
from pathlib import Path

work = (Path.home() / 'projects/worldwide-stages-options-02-05-rebuild-20261002'
        / 'reviews/pending-review-20261004')
out = Path(__file__).resolve().parent / 'site/worldwide-stages-david/pending-review'

def copy(relative, digest=None):
    source, dest = work / relative, out / relative
    if digest and hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        raise ValueError(f'Wrong published bytes: {relative}')
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    return dest

for name in ('index.html','site-allocation.svg','refinement/materials.html',
             'refinement/materials-data.json','refinement/refined-v3-interior.png',
             'refinement/refined-v3-aerial.png','refinement/refined-v3-rear.png'):
    copy(name)
data = json.loads((work / 'review-data.json').read_text())
data['hall']['url'] = '../garden-hall-study.html'
data['speed'].pop('url', None)
data['speed']['description'] = 'This experimental viewer is unavailable.'
(out / 'review-data.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
for path, depth, extra in [('hills', 2, ()), ('refinement/hills', 3,
        ('hillside-walk.js','walk-space.mjs','assets/hillside-data/walk-contract.json'))]:
    page = copy(path+'/hillside-study.html')
    page.write_text(page.read_text().replace('/worldwide-stages-david/vendor/', '../'*depth+'vendor/'))
    for name in ('hillside-study.js','campus-performance-check-v1.js',
                 'assets/kloppenheim_06_puresky.hdr', *extra):
        copy(path+'/'+name)
    config = json.loads(copy(path+'/assets/hillside-data/view-config.json').read_text())
    copy(path+'/assets/hillside-data/hillside-pair.glb', config['browserModelSha256'])
