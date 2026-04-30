"""
database.py — Simple daily visitor tracking for Neon PostgreSQL
"""
import os
from typing import Optional
import asyncpg
from asyncpg.pool import Pool

# Database connection pool
db_pool: Optional[Pool] = None


async def init_db():
    """Initialize database connection pool and create tables."""
    global db_pool
    
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("⚠️  DATABASE_URL not set - visitor tracking disabled")
        return
    
    try:
        db_pool = await asyncpg.create_pool(
            database_url,
            min_size=1,
            max_size=10,
            command_timeout=60
        )
        
        # Create tables if they don't exist
        async with db_pool.acquire() as conn:
            # Table to track unique visitors per day
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS unique_visitors (
                    visit_date DATE DEFAULT CURRENT_DATE,
                    ip_address TEXT NOT NULL,
                    PRIMARY KEY (visit_date, ip_address)
                )
            """)
            
            # Table to store daily visitor counts
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS daily_stats (
                    stat_date DATE PRIMARY KEY,
                    visitor_count INT NOT NULL DEFAULT 0
                )
            """)
        
        print("✅ Database connected - visitor tracking enabled")
    except Exception as e:
        print(f"⚠️  Database connection failed: {e}")
        db_pool = None


async def close_db():
    """Close database connection pool."""
    global db_pool
    if db_pool:
        await db_pool.close()
        db_pool = None


async def track_visitor(ip_address: str) -> bool:
    """
    Track a unique visitor by IP address for today.
    Increments the daily visitor count if this is a new visitor today.
    Returns True if this is a new visitor for today.
    """
    if not db_pool:
        return False
    
    try:
        async with db_pool.acquire() as conn:
            # Try to insert visitor (will fail if already exists for today)
            result = await conn.execute("""
                INSERT INTO unique_visitors (visit_date, ip_address)
                VALUES (CURRENT_DATE, $1)
                ON CONFLICT (visit_date, ip_address) DO NOTHING
            """, ip_address)
            
            # Check if a new row was inserted
            is_new = result == "INSERT 0 1"
            
            if is_new:
                # Increment daily visitor count
                await conn.execute("""
                    INSERT INTO daily_stats (stat_date, visitor_count)
                    VALUES (CURRENT_DATE, 1)
                    ON CONFLICT (stat_date) 
                    DO UPDATE SET visitor_count = daily_stats.visitor_count + 1
                """)
            
            return is_new
    except Exception as e:
        print(f"Error tracking visitor: {e}")
        return False
