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

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS feedback (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    building TEXT NOT NULL,
                    improvements TEXT NOT NULL,
                    features TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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


async def get_analytics_summary() -> dict:
    """Return aggregate visitor and feedback counts."""
    if not db_pool:
        return {
            "enabled": False,
            "total_visitors": 0,
            "today_visitors": 0,
            "feedback_count": 0,
        }

    try:
        async with db_pool.acquire() as conn:
            total_visitors = await conn.fetchval("""
                SELECT COALESCE(SUM(visitor_count), 0)
                FROM daily_stats
            """)
            today_visitors = await conn.fetchval("""
                SELECT COALESCE(visitor_count, 0)
                FROM daily_stats
                WHERE stat_date = CURRENT_DATE
            """)
            feedback_count = await conn.fetchval("""
                SELECT COUNT(*)
                FROM feedback
            """)
            return {
                "enabled": True,
                "total_visitors": total_visitors or 0,
                "today_visitors": today_visitors or 0,
                "feedback_count": feedback_count or 0,
            }
    except Exception as e:
        print(f"Error getting analytics summary: {e}")
        return {
            "enabled": False,
            "total_visitors": 0,
            "today_visitors": 0,
            "feedback_count": 0,
        }


async def get_daily_stats(days: int = 30) -> list[dict]:
    """Return daily visitor counts for the last N days."""
    if not db_pool:
        return []

    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT stat_date, visitor_count
                FROM daily_stats
                WHERE stat_date >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
                ORDER BY stat_date DESC
            """, days)
            return [
                {
                    "date": row["stat_date"].isoformat(),
                    "visitor_count": row["visitor_count"],
                }
                for row in rows
            ]
    except Exception as e:
        print(f"Error getting daily stats: {e}")
        return []


async def submit_feedback(
    name: str,
    building: str,
    improvements: str,
    features: str,
) -> Optional[int]:
    """Store a feedback submission and return its id."""
    if not db_pool:
        return None

    try:
        async with db_pool.acquire() as conn:
            return await conn.fetchval("""
                INSERT INTO feedback (name, building, improvements, features)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            """, name, building, improvements, features)
    except Exception as e:
        print(f"Error submitting feedback: {e}")
        return None


async def get_recent_feedback(limit: int = 50) -> list[dict]:
    """Return recent feedback submissions."""
    if not db_pool:
        return []

    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, name, building, improvements, features, created_at
                FROM feedback
                ORDER BY created_at DESC
                LIMIT $1
            """, limit)
            return [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "building": row["building"],
                    "improvements": row["improvements"],
                    "features": row["features"],
                    "created_at": row["created_at"].isoformat(),
                }
                for row in rows
            ]
    except Exception as e:
        print(f"Error getting recent feedback: {e}")
        return []
