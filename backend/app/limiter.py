"""
Shared rate-limiter instance.

Imported by main.py (to register middleware/handler) and by route modules
(to apply @limiter.limit decorators), avoiding circular imports.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
