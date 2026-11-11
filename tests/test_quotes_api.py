import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
PASSWORD = "quotes-test-password"


class QuotesApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        php = os.environ.get("PHP_BINARY", "php")
        if not shutil.which(php):
            raise RuntimeError("PHP is required; set PHP_BINARY to the PHP executable.")
        cls.temp = tempfile.TemporaryDirectory(prefix="philadelphia-quotes-test-")
        cls.site = Path(cls.temp.name)
        api = cls.site / "api"
        api.mkdir()
        cls.storage = api / "storage"
        cls.storage.mkdir()
        for name in ("auth.php", "common.php", "config.php", "content.php"):
            shutil.copy2(ROOT / "api" / name, api / name)
        shutil.copy2(ROOT / "page-visibility.json", cls.site / "page-visibility.json")
        password_hash = subprocess.check_output(
            [php, "-r", f"echo password_hash('{PASSWORD}', PASSWORD_DEFAULT);"],
            text=True,
        )
        (cls.storage / "admin-password.json").write_text(
            json.dumps({"passwordHash": password_hash}), encoding="utf-8"
        )
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{port}"
        cls.log = open(cls.site / "server.log", "w+", encoding="utf-8")
        cls.server = subprocess.Popen(
            [php, "-S", f"127.0.0.1:{port}", "-t", str(cls.site)],
            stdout=cls.log,
            stderr=subprocess.STDOUT,
        )
        for _ in range(100):
            try:
                with urllib.request.urlopen(cls.base + "/api/content.php?collection=quotes", timeout=1):
                    break
            except (OSError, urllib.error.URLError):
                if cls.server.poll() is not None:
                    break
                time.sleep(0.05)
        else:
            cls.server.terminate()
            cls.server.wait(timeout=5)
            raise RuntimeError("PHP test server did not start.")
        if cls.server.poll() is not None:
            cls.log.seek(0)
            raise RuntimeError(f"PHP test server exited: {cls.log.read()}")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.log.close()
        cls.temp.cleanup()

    def setUp(self):
        (self.storage / "content.json").write_text(
            json.dumps({"leaders": [{"id": "existing", "title": "Existing ministry"}]}),
            encoding="utf-8",
        )
        self.client = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.token = None

    def request(self, method, path, body=None, token=None):
        headers = {"Accept": "application/json", "Origin": self.base}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        if token is not None:
            headers["X-CSRF-Token"] = token
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            response = self.client.open(request, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def login(self):
        status, result = self.request("POST", "/api/auth.php", {"password": PASSWORD})
        self.assertEqual(status, 200, result)
        self.token = result["csrfToken"]

    def quote_request(self, method, body=None, suffix=""):
        return self.request(method, "/api/content.php?collection=quotes" + suffix, body, self.token)

    def test_existing_content_without_quotes_remains_readable(self):
        status, result = self.quote_request("GET")
        self.assertEqual((status, result["items"]), (200, []))
        status, content = self.request("GET", "/api/content.php")
        self.assertEqual(status, 200)
        self.assertEqual(content["leaders"][0]["id"], "existing")
        self.assertEqual(content["quotes"], [])

    def test_writes_require_authentication_and_csrf(self):
        record = {"id": "q1", "text": "Test"}
        status, _ = self.quote_request("POST", record)
        self.assertEqual(status, 401)
        self.login()
        status, _ = self.request("POST", "/api/content.php?collection=quotes", record)
        self.assertEqual(status, 403)

    def test_create_update_and_delete_with_optional_photo_and_translations(self):
        self.login()
        record = {
            "id": "q1",
            "text": " Текст цитаты ",
            "author": " Автор ",
            "image": "",
            "dimImage": False,
            "translations": {
                "nl": {"text": "Nederlandse tekst", "author": "Bron"},
                "en": {"text": "English text", "author": "Source"},
            },
        }
        status, result = self.quote_request("POST", record)
        self.assertEqual(status, 200, result)
        saved = result["items"][0]
        self.assertEqual(saved["text"], "Текст цитаты")
        self.assertEqual(saved["author"], "Автор")
        self.assertIs(saved["dimImage"], False)
        self.assertEqual(saved["translations"]["en"]["author"], "Source")

        saved.update({"image": "data:image/png;base64,aGVsbG8=", "dimImage": True})
        status, result = self.quote_request("PUT", saved, "&id=q1")
        self.assertEqual(status, 200, result)
        self.assertTrue(result["items"][0]["dimImage"])
        self.assertTrue(result["items"][0]["image"].startswith("data:image/png;base64,"))

        saved["image"] = ""
        status, result = self.quote_request("PUT", saved, "&id=q1")
        self.assertEqual(status, 200, result)
        self.assertEqual(result["items"][0]["image"], "")
        status, result = self.quote_request("DELETE", suffix="&id=q1")
        self.assertEqual((status, result["items"]), (200, []))
        status, content = self.request("GET", "/api/content.php?collection=leaders")
        self.assertEqual(content["items"][0]["id"], "existing")

    def test_validation_defaults_and_atomic_replacement(self):
        self.login()
        status, result = self.quote_request("POST", {"id": "q1", "text": "Valid"})
        self.assertEqual(status, 200, result)
        self.assertTrue(result["items"][0]["dimImage"])
        for invalid in (
            {"id": "blank", "text": "  "},
            {"id": "bad-dimming", "text": "Test", "dimImage": "false"},
            {"id": "bad-image", "text": "Test", "image": "javascript:alert(1)"},
            {"id": "bad-translation", "text": "Test", "translations": {"en": {"text": 12}}},
        ):
            status, _ = self.quote_request("POST", invalid)
            self.assertEqual(status, 422, invalid)
        status, _ = self.quote_request("POST", {"id": "q1", "text": "Duplicate"})
        self.assertEqual(status, 409)
        status, _ = self.quote_request("PUT", {"items": [
            {"id": "q2", "text": "Replacement"},
            {"id": "q3", "text": ""},
        ]})
        self.assertEqual(status, 422)
        status, result = self.quote_request("GET")
        self.assertEqual([item["id"] for item in result["items"]], ["q1"])

    def test_record_limit_does_not_make_content_unreadable(self):
        self.login()
        items = [{"id": f"q{index}", "text": "Quote"} for index in range(500)]
        status, result = self.quote_request("PUT", {"items": items})
        self.assertEqual(status, 200, result)
        status, _ = self.quote_request("POST", {"id": "extra", "text": "One too many"})
        self.assertEqual(status, 422)
        status, result = self.quote_request("GET")
        self.assertEqual(status, 200)
        self.assertEqual(len(result["items"]), 500)
        status, _ = self.request("GET", "/api/content.php?collection=leaders")
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
