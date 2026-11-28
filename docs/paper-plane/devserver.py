"""開發用靜態伺服器：GET 跟 http.server 一樣；PUT /_save/<檔名> 把內容存到 docs/paper-plane/shots/（只收 .png/.jpg）。
用法（在 worktree 根目錄）：python docs/paper-plane/devserver.py 5193
"""
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = os.path.join(ROOT, 'docs', 'paper-plane', 'shots')


class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_PUT(self):
        m = re.fullmatch(r'/_save/([\w\-]+\.(png|jpg))', self.path)
        if not m:
            self.send_error(400)
            return
        os.makedirs(SHOTS, exist_ok=True)
        n = int(self.headers.get('Content-Length', 0))
        with open(os.path.join(SHOTS, m.group(1)), 'wb') as f:
            f.write(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()


ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 5193), H).serve_forever()
