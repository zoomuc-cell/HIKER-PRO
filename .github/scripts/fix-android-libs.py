"""CI 전용: 오래된 Android 라이브러리를 AGP 8+/Gradle 9 에서 빌드할 수 있게 고친다.

- android { } 에 namespace 가 없으면 AndroidManifest.xml 의 package 값으로 추가
- Gradle 9 에서 제거된 jcenter() 저장소 제거

개발자 PC 의 node_modules 에는 같은 수정이 이미 직접 적용돼 있어, 저장소에는 패치를 넣지 않고
CI 에서만 실행한다.
"""
import json
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
config = json.loads(subprocess.check_output(['npx', 'react-native', 'config'], cwd=root, text=True))

for name, dep in config['dependencies'].items():
    android = dep['platforms'].get('android')
    if not android:
        continue
    source = pathlib.Path(android['sourceDir'])
    gradle = source / 'build.gradle'
    if not gradle.exists():
        continue
    text = gradle.read_text(encoding='utf-8')
    original = text
    text = re.sub(r'^\s*jcenter\(\)\s*$\n?', '', text, flags=re.M)
    if 'namespace' not in text:
        manifest = source / 'src' / 'main' / 'AndroidManifest.xml'
        match = re.search(r'package="([^"]+)"', manifest.read_text(encoding='utf-8')) if manifest.exists() else None
        if match:
            text = re.sub(r'^android\s*\{', 'android {\n    namespace "%s"' % match.group(1), text, count=1, flags=re.M)
    if text != original:
        gradle.write_text(text, encoding='utf-8')
        print('patched', name)
