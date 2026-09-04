"""
SQLAlchemy async engine + session factory.
Uses asyncpg driver for maximum throughput.
"""
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from config import settings
import ssl

# Convert postgres:// → postgresql+asyncpg://
# Also strip psycopg2-style params that asyncpg doesn't accept
_url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Remove sslmode and channel_binding query params — asyncpg uses connect_args instead
import re
_url = re.sub(r"[?&]sslmode=[^&]*", "", _url)
_url = re.sub(r"[?&]channel_binding=[^&]*", "", _url)
# Clean up any trailing ? or & left behind
_url = re.sub(r"[?&]$", "", _url)

# Build SSL context for Neon (requires SSL)
_ssl_ctx = ssl.create_default_context()

engine = create_async_engine(
    _url,
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    echo=False,
    connect_args={"ssl": _ssl_ctx},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass
