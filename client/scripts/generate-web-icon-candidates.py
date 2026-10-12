"""Generate review candidates only. Never touches public/dist/recipe/reviews."""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib, json, copy, importlib.util, os

client = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('web_icons', client / 'scripts/generate-web-icons.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
base = json.loads((client / 'icon-source/recipe.json').read_text())
root = Path(os.environ['ICON_CANDIDATE_DIR'])
root.mkdir(parents=True, exist_ok=True)
protected = [client / 'icon-source/recipe.json'] + [client / 'public' / name for name in base['outputs']]
before = {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
candidates = [('A',(120,30),(220,230)),('B',(100,100),(220,230)),('C',(180,10),(240,251)),('D',(650,100),(230,240))]
report = {'releaseAccepted':False,'originalTransform':'identity','candidates':[]}
for name, position, size in candidates:
    recipe = copy.deepcopy(base)
    recipe['HPlacement']['position'] = list(position)
    recipe['HPlacement']['size'] = list(size)
    original, layer, result = module.compose(client,recipe)
    out = root / name
    out.mkdir()
    result.save(out / 'composition-1024.png')
    alpha = Image.new('L',original.size,0)
    alpha.paste(layer.getchannel('A'),position)
    mask = Image.new('L',original.size,0)
    ImageDraw.Draw(mask).ellipse((0,0,1023,1023),fill=255)
    outside_circle = sum(a>0 and m==0 for a,m in zip(alpha.getdata(),mask.getdata()))
    outside_changed = sum(a==0 and p!=q for a,p,q in zip(alpha.getdata(),original.getdata(),result.getdata()))
    assert outside_changed == 0
    for filename, record in recipe['outputs'].items():
        image = result if record['size']==1024 else result.resize((record['size'],record['size']),Image.Resampling.LANCZOS)
        image.save(out / filename)
        record['sha256'] = hashlib.sha256((out / filename).read_bytes()).hexdigest()
    for s in (32,48,64,180,192,512):
        image = result.resize((s,s),Image.Resampling.LANCZOS)
        image.save(out / ('actual-'+str(s)+'.png'))
        for kind in ('rounded','circle'):
            m=Image.new('L',(s,s),0)
            d=ImageDraw.Draw(m)
            if kind=='circle':d.ellipse((0,0,s-1,s-1),fill=255)
            else:d.rounded_rectangle((0,0,s-1,s-1),radius=s*.22,fill=255)
            clipped=Image.new('RGBA',(s,s));clipped.paste(image,(0,0),m)
            clipped.save(out / ('actual-'+str(s)+'-'+kind+'.png'))
    # True-size board: each icon stays at its real pixel size, never enlarged.
    board=Image.new('RGB',(900,900),'#eeeeee');draw=ImageDraw.Draw(board);y=10
    for s in (32,48,64,180,192):
        draw.text((5,y),str(s)+' px / square / rounded / circle',fill='black')
        for x,suffix in ((10,''),(300,'-rounded'),(590,'-circle')):
            im=Image.open(out / ('actual-'+str(s)+suffix+'.png')).convert('RGBA')
            board.paste(im,(x,y+20),im)
        y += s+38
    board.save(out / 'real-size-mask-board.png')
    recipe['pixelsOutsideActualHChanged']=outside_changed
    recipe['HAlphaPixelsOutsideCircularMask']=outside_circle
    recipe['visualStatus']='CANDIDATE_NOT_RELEASE_ACCEPTED'
    (out / 'candidate-recipe.json').write_text(json.dumps(recipe,indent=2)+'\n')
    report['candidates'].append({'name':name,'position':position,'size':size,'HAlphaPixelsOutsideCircularMask':outside_circle,'pixelsOutsideActualHChanged':outside_changed,'releaseAccepted':False})
assert before == {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
(root / 'candidate-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
