"""
Keep the Lambda's memory flat at 128 MB.

Password hashing (scrypt) briefly needs ~16 MB. By default glibc's allocator raises its
"mmap threshold" after such a block is freed and keeps later blocks of that size on its heap,
so every warm Lambda permanently loses ~16 MB after its first sign-in. Close to the 128 MB
limit that made requests take ~15 s. Fixing the threshold makes large blocks always come from,
and go straight back to, the operating system. Password security is unchanged.
"""

import ctypes
import logging
import sys

logger = logging.getLogger(__name__)

_M_MMAP_THRESHOLD = -3  # glibc mallopt() option
_THRESHOLD_BYTES = 128 * 1024  # glibc's default starting value, but no longer adjusted upwards


def return_large_blocks_to_os() -> bool:
    """Apply the allocator setting. Returns False (and does nothing) outside glibc Linux."""
    if not sys.platform.startswith("linux"):
        return False
    try:
        libc = ctypes.CDLL("libc.so.6")
        applied = bool(libc.mallopt(_M_MMAP_THRESHOLD, _THRESHOLD_BYTES))
    except (OSError, AttributeError):  # not glibc (e.g. musl) or no mallopt
        return False
    if not applied:
        logger.warning("Could not set the malloc mmap threshold")
    return applied
