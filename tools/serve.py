"""개발용 정적 서버: 프로젝트 폴더를 캐시 없이 제공합니다.
사용: python tools/serve.py [포트]   (기본 5173, 프로젝트 루트에서 실행)
"""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache).serve_forever()
