from __future__ import annotations

import base64
import os
import uuid
import urllib.error
import urllib.request


origin = os.environ.get("RADICALE_TEST_ORIGIN", "http://localhost:5173")
username = os.environ["RADICALE_TEST_USERNAME"]
password = os.environ["RADICALE_TEST_PASSWORD"]
url = "http://127.0.0.1:5232/" + username + "/calendar/"
authorization = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()

preflight = urllib.request.Request(
    url,
    headers={
        "Origin": origin,
        "Access-Control-Request-Method": "PROPFIND",
        "Access-Control-Request-Headers": "authorization,content-type,depth",
    },
    method="OPTIONS",
)
try:
    with urllib.request.urlopen(preflight, timeout=5) as response:
        methods = response.headers.get("Access-Control-Allow-Methods", "")
        allowed_headers = response.headers.get("Access-Control-Allow-Headers", "").lower()
        allowed_origin = response.headers.get("Access-Control-Allow-Origin", "")
        if response.status not in (200, 204):
            raise RuntimeError(f"CORS preflight returned HTTP {response.status}.")
        if allowed_origin != origin:
            raise RuntimeError(f"CORS origin mismatch: {allowed_origin!r}.")
        if "PROPFIND" not in methods:
            raise RuntimeError("Radicale CORS response does not allow PROPFIND.")
        if "authorization" not in allowed_headers:
            raise RuntimeError("Radicale CORS response does not allow Authorization.")
        print(f"CORS preflight: HTTP {response.status}, origin {allowed_origin}")
except urllib.error.HTTPError as error:
    raise RuntimeError(f"CORS preflight returned HTTP {error.code}.") from error

probe = urllib.request.Request(
    url,
    data=b"<?xml version='1.0'?><d:propfind xmlns:d='DAV:'><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>",
    headers={"Authorization": authorization, "Origin": origin, "Depth": "0", "Content-Type": "application/xml"},
    method="PROPFIND",
)
with urllib.request.urlopen(probe, timeout=5) as response:
    if response.status != 207:
        raise RuntimeError(f"Authenticated PROPFIND returned HTTP {response.status}.")
    print("Authenticated calendar PROPFIND: HTTP 207 Multi-Status")

event_id = f"lethargic-desk-smoke-{uuid.uuid4()}.ics"
event_url = url + event_id
event = (
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Lethargic Desk//Setup Smoke Test//EN\r\n"
    f"BEGIN:VEVENT\r\nUID:{event_id}\r\nDTSTAMP:20261119T000000Z\r\n"
    "DTSTART:20261120T100000Z\r\nDTEND:20261120T103000Z\r\n"
    "SUMMARY:Lethargic Desk setup smoke test\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
).encode()
create_event = urllib.request.Request(
    event_url,
    data=event,
    headers={"Authorization": authorization, "Origin": origin, "Content-Type": "text/calendar; charset=utf-8"},
    method="PUT",
)
with urllib.request.urlopen(create_event, timeout=5) as response:
    if response.status not in (200, 201, 204):
        raise RuntimeError(f"Calendar event PUT returned HTTP {response.status}.")

read_event = urllib.request.Request(event_url, headers={"Authorization": authorization, "Origin": origin})
with urllib.request.urlopen(read_event, timeout=5) as response:
    if response.status != 200 or "setup smoke test" not in response.read().decode():
        raise RuntimeError("The test calendar event could not be read back.")

delete_event = urllib.request.Request(event_url, headers={"Authorization": authorization, "Origin": origin}, method="DELETE")
with urllib.request.urlopen(delete_event, timeout=5) as response:
    if response.status not in (200, 204):
        raise RuntimeError(f"Calendar event DELETE returned HTTP {response.status}.")
print("Calendar event PUT / GET / DELETE: passed")
