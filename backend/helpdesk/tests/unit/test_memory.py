"""The allocator setting that keeps password hashing from holding on to memory."""

import ctypes
import subprocess
import sys
import textwrap

import pytest

from app.core import memory

_PROBE = textwrap.dedent("""
    import hashlib, os, sys
    sys.path.insert(0, ".")
    if sys.argv[1] == "fixed":
        from app.core.memory import return_large_blocks_to_os
        assert return_large_blocks_to_os()
    def rss_mb():
        for line in open("/proc/self/status"):
            if line.startswith("VmRSS"):
                return int(line.split()[1]) / 1024
    before = rss_mb()
    for _ in range(3):
        hashlib.scrypt(b"Password123", salt=os.urandom(16), n=2**14, r=8, p=1, dklen=64)
    print(rss_mb() - before)
""")


def _growth_after_hashing(mode: str) -> float:
    result = subprocess.run([sys.executable, "-c", _PROBE, mode], capture_output=True, text=True, check=True)
    return float(result.stdout)


@pytest.mark.skipif(not sys.platform.startswith("linux"), reason="glibc allocator behaviour")
def test_password_hashing_memory_goes_back_to_the_os():
    assert _growth_after_hashing("default") > 10  # the problem: ~16 MB kept after hashing
    assert _growth_after_hashing("fixed") < 4     # with the setting: returned


def test_does_nothing_where_glibc_is_missing(monkeypatch):
    def missing(_name):
        raise OSError("no libc.so.6")

    monkeypatch.setattr(ctypes, "CDLL", missing)
    assert memory.return_large_blocks_to_os() is False


def test_does_nothing_outside_linux(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    assert memory.return_large_blocks_to_os() is False
