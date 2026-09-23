"""
Shared test configuration. Environment is set before the app is imported so
config readers pick up test values.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.update({
    "IS_LOCAL": "true",
    "POSTGRES_HOST": os.getenv("TEST_POSTGRES_HOST", "localhost"),
    "POSTGRES_PORT": os.getenv("TEST_POSTGRES_PORT", "5432"),
    "POSTGRES_USER": os.getenv("TEST_POSTGRES_USER", "postgres"),
    "POSTGRES_PASS": os.getenv("TEST_POSTGRES_PASS", "postgres123"),
    "POSTGRES_NAME": os.getenv("TEST_POSTGRES_NAME", "helpdesk_test"),
    "JWT_SECRET": "test-secret-key-that-is-long-enough-for-hs256",
    "ADMIN_BOOTSTRAP_EMAIL": "admin@acme.inc",
    "ADMIN_BOOTSTRAP_PASSWORD": "Bootstrap123",
    "SEED_DEMO_DATA": "false",
})
