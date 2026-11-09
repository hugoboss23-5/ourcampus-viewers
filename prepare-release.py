"""Reconstruct the already public Oct 4 campus and Nov 5 Bendac from local copies."""
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECTS = Path.home() / 'projects'
SOURCE = PROJECTS / 'worldwide-stages-options-02-05-rebuild-20261002'
WEB = SOURCE / 'web'
REV = SOURCE / 'reviews'
WORK = REV / 'pending-review-20261004'
INTEGRATION = REV / 'campus-integration-20261004'
OUT = HERE / 'site'
CAMPUS = OUT / 'worldwide-stages-david'

def digest(path):
    with path.open('rb') as f:
        h = hashlib.sha256()
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
        return h.hexdigest()

def copy(source, target, sha=None):
    if sha and digest(source) != sha:
        raise ValueError(f'Wrong published bytes: {source}')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)

def copy_list(root, output, paths):
    for name in paths:
        copy(root / name, output / name)

def tree(root, dest, ext):
    for path in sorted(root.rglob('*')):
        if path.is_file() and path.suffix in ext and not any(x.startswith('.') for x in path.relative_to(root).parts):
            if root.resolve() not in path.resolve().parents:
                raise ValueError(f'Unexpected symlink: {path}')
            copy(path, dest / path.relative_to(root))

OUT.mkdir(exist_ok=False)
(OUT / '.nojekyll').touch()
(OUT / 'index.html').write_text("""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><title>OurCampus project viewers</title>
<h1>OurCampus project viewers</h1>
<ul>
<li><a href="worldwide-stages-david/?option=option-05&amp;revision=paired-hill-final-20261004">Tennessee campus · 3D model</a></li>
<li><a href="bendac/">Bendac website concepts</a></li>
<li><a href="https://hugoboss23-5.github.io/ourcampus-work/">All OurCampus work</a></li>
</ul>
""", encoding='utf-8')
main = {
    'index.html':'4391bc9b80ffa23ea5a0adf07e709ae0f84ef3b55a1f7c94655f6ef024aecc9d',
    'viewer.js':'efabf0d24b33a2c312130cc1f3153e3b1acc08b8bf3fdd329357eea171095dbd',
    'campus-tour-v3.js':'6ac1000e042173ebcfced9afa9c148b7dbc8fc1b948dc6ae453c89309080a4b5',
}
for name, sha in main.items():
    copy(WEB / name, CAMPUS / name, sha)
copy_list(WEB, CAMPUS, ['style.css','garden-hall-study.html','garden-hall-study.js',
    'campus-navigation-ui-v1.js','campus-night-lighting-v1.js','campus-performance-check-v1.js',
    'hand-controls.js','hand-tracking-worker.js','campus-tour-v2.js','campus-tour.js','navigation-collision-v1.js','navigation-controls-v3.js',
    'render-timing-v1.js','tour-frame-timing-v1.js','tour-paths-v2.js','tour-paths-v3.js',
    'tour-paths-v4.js','tour-paths.js','tree-impostor-v1.js','tree-visibility-v1.js'])
tree(WEB / 'vendor', CAMPUS / 'vendor', {'.js','.mjs','.json','.txt','.task','.wasm'})
copy_list(WEB / 'assets', CAMPUS / 'assets', ['kloppenheim_06_puresky.hdr',
    'industrial_sunset_02_puresky.hdr','vegetation-tree-distance.glb',
    'option-05-dimensions.pdf','option-05-plan.dxf',
    'two-options-comparison.pdf'])
copy(WEB / 'assets/option-05-plan.json', CAMPUS / 'assets/option-05-plan.json',
     '910ef70bf621547b2ba86eaeaf015bb1f89b12e81cb8e777d5ccdf3d45c8c03b')
data = json.loads((WEB / 'assets/options.json').read_text())
old, exact = data['options']
assert old['id'] == 'option-02' and exact['id'] == 'option-05'
# Preserve comparison facts; suppress unavailable model and native download actions.
old['modelAvailable'] = False
old['downloads'] = {}
exact['downloads'] = {k: v for k, v in exact['downloads'].items() if k in {'pdf','dxf'}}
(CAMPUS / 'assets/options.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
viewer = CAMPUS / 'viewer.js'
code = viewer.read_text()
for original, revised in [
    ('if(!option)return;if(captureBusy)', "if(!option)return;if(option.modelAvailable===false){toast('This 3D option is unavailable.');return;}if(captureBusy)"),
    ("nameCell.append(button);row.append(nameCell);", "if(option.modelAvailable===false){nameCell.textContent=button.textContent+' (comparison only)';}else nameCell.append(button);row.append(nameCell);"),
    ("option.id===requested)?requested", "option.id===requested&&option.modelAvailable!==false)?requested"),
]:
    assert code.count(original) == 1, original
    code = code.replace(original, revised)
viewer.write_text(code)
copy(REV / 'viewer-performance-20261004/public-decoded-option-05.glb',
     CAMPUS / 'assets' / exact['model'], exact['model_sha256'])

placement = INTEGRATION / 'viewer/placement-contract.json'
contract = json.loads(placement.read_text())
models = CAMPUS / 'assets/integrated-20261004'
copy(placement, models / 'placement-contract.json')
copy(INTEGRATION / 'geometry/performance-additions.glb', models / contract['hall']['asset'], contract['hall']['sha256'])
copy(SOURCE / contract['hills']['assetRelativeToProject'], models / contract['hills']['asset'], contract['hills']['sha256'])
copy_list(WORK / 'integration', CAMPUS / 'pending-review/integration', ['campus-additions.js','site-ground-cut.js','walk-contract.json','walk-space.mjs'])
copy(WORK / 'integration/integrated-tour.js', CAMPUS / 'pending-review/integration/integrated-tour.js',
     '78aed7db4aca2a4c428826ec6ba705618a1e9f332b8c5ac38e50214c771c4c2f')
copy_list(REV / 'garden-performance-hall-20261004', CAMPUS / 'assets/garden-hall-design-study-20261004',
          ['garden-hall.glb', 'build-receipt.json'])
tree(WORK / 'progress', CAMPUS / 'pending-review/progress', {'.html','.png'})

# This is the Nov 5 public 12-version collection, with its portable relative links.
tree(PROJECTS / 'bendac-all-versions-20261105/site', OUT / 'bendac',
     {'.css','.hdr','.html','.jpg','.js','.json','.mp4','.png','.webp','.woff2'})
