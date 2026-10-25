"""Copy only this checkout's tracked and feature source to its isolated SSD test tree."""
from pathlib import Path
import subprocess
source = Path(__file__).resolve().parents[1]
target = Path('/Users/hank/.cache/hank-internal/wishlist-monetization-20261025')
if not (target/'test-copy-provenance.json').is_file():
    raise SystemExit('Missing scoped test-copy provenance')
files = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'], cwd=source).split(b'\0')
for name in files:
    if not name: continue
    rel=Path(name.decode())
    if any(part in ['node_modules','.git','dist','build'] for part in rel.parts): continue
    original=source/rel
    if not original.is_file() or original.is_symlink(): continue
    destination=target/rel
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_bytes(original.read_bytes())
    destination.chmod(original.stat().st_mode & 0o777)
print('Scoped test sources synchronized; dependencies and runtime data preserved')
