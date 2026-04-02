import uuid
from datetime import datetime, timezone


def generate_run_id() -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    short_uuid = uuid.uuid4().hex[:6]
    return f"{timestamp}-{short_uuid}"
