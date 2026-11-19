from __future__ import annotations

import base64
import os
import subprocess
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import bcrypt


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / ".radicale-data"
COLLECTIONS = DATA / "collections"
USERS = DATA / "users"
CONFIG = DATA / "config"
USERNAME = "lethargicdesk"
CALENDAR = "calendar"


def write_server_files(password: str, allowed_origin: str) -> None:
    DATA.mkdir(exist_ok=True)
    COLLECTIONS.mkdir(exist_ok=True)
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    USERS.write_text(f"{USERNAME}:{password_hash}\n", encoding="utf-8")

    config = f"""[server]
hosts = 127.0.0.1:5232

[auth]
type = htpasswd
htpasswd_filename = {USERS.as_posix()}
htpasswd_encryption = bcrypt
delay = 1

[rights]
type = owner_only

[storage]
filesystem_folder = {COLLECTIONS.as_posix()}

[headers]
Access-Control-Allow-Origin = {allowed_origin}
Access-Control-Allow-Methods = OPTIONS, PROPFIND, REPORT, GET, HEAD, PUT, DELETE, MKCOL, MOVE, COPY, PROPPATCH
Access-Control-Allow-Headers = Authorization, Content-Type, Depth, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since, Prefer, DAV, CalDAV, Origin, Accept
Access-Control-Expose-Headers = ETag, DAV, CalDAV, Allow, Sync-Token
"""
    CONFIG.write_text(config, encoding="utf-8")


def create_calendar(password: str) -> None:
    path = f"http://127.0.0.1:5232/{USERNAME}/{CALENDAR}/"
    auth = base64.b64encode(f"{USERNAME}:{password}".encode()).decode()
    request = urllib.request.Request(
        path,
        data=b"",
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/xml; charset=utf-8"},
        method="MKCALENDAR",
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            if response.status not in (200, 201, 207):
                raise RuntimeError(f"Radicale calendar creation returned HTTP {response.status}.")
    except urllib.error.HTTPError as error:
        if error.code not in (200, 201, 207, 405):
            raise RuntimeError(f"Radicale calendar creation failed with HTTP {error.code}.") from error
        if error.code == 405:
            # MKCALENDAR is expected to be idempotent only for an existing path;
            # verify that the existing resource is a calendar collection.
            probe = urllib.request.Request(
                path,
                headers={"Authorization": f"Basic {auth}", "Depth": "0"},
                method="PROPFIND",
                data=b"<?xml version='1.0'?><d:propfind xmlns:d='DAV:'><d:prop><d:resourcetype/></d:prop></d:propfind>",
            )
            with urllib.request.urlopen(probe, timeout=4) as response:
                if response.status != 207:
                    raise RuntimeError("The existing Radicale path is not a calendar collection.")


def main() -> None:
    if USERS.exists():
        print(f"Radicale is already configured. Credentials are in the local password manager you used during setup.")
        print("Local server URL: http://127.0.0.1:5232")
        print(f"Calendar collection URL: http://127.0.0.1:5232/{USERNAME}/{CALENDAR}/")
        return

    password = secrets.token_urlsafe(24)
    allowed_origin = os.environ.get("LETHARGIC_DESK_ORIGIN", "http://localhost:5173").strip()
    if not allowed_origin.startswith(("http://localhost", "http://127.0.0.1")):
        raise SystemExit("For this local setup, the allowed origin must be localhost or 127.0.0.1.")
    write_server_files(password, allowed_origin)
    server = subprocess.Popen(
        [sys.executable, "-m", "radicale", "--config", str(CONFIG)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(30):
            if server.poll() is not None:
                raise RuntimeError("Radicale exited before its local server became ready.")
            try:
                with urllib.request.urlopen("http://127.0.0.1:5232/", timeout=1):
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(0.25)
        else:
            raise RuntimeError("Radicale did not start on 127.0.0.1:5232.")
        create_calendar(password)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
    print("Local Radicale account created:")
    print(f"  Username: {USERNAME}")
    print(f"  Password: {password}")
    print("Save this password now; only its bcrypt hash is stored on disk.")
    print(f"  Calendar URL: http://127.0.0.1:5232/{USERNAME}/{CALENDAR}/")


if __name__ == "__main__":
    main()
