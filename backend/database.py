"""
database.py — Neon PostgreSQL database integration for user tracking and feedback
"""
import os
from datetime import date
from typing import Optional, List, Dict, Any
import asyncpg
from asyncpg.pool import Pool

# Database connection pool
db_pool: Optional[Pool] = None


async def init_db():
    """Initialize database connection pool and create tables."""
    global db_pool
    
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("⚠️  DATABASE_URL not set - analytics disabled")
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
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS unique_visitors (
                    visit_date DATE DEFAULT CURRENT_DATE,
                    ip_address TEXT NOT NULL,
                    PRIMARY KEY (visit_date, ip_address)
                )
            """)
            
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS daily_stats (
                    stat_date DATE PRIMARY KEY,
                    total_visitors INT NOT NULL DEFAULT 0
                )
            """)
            
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS feedback (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    building TEXT NOT NULL,
                    improvements TEXT NOT NULL,
                    features TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        
        print("✅ Database connected and tables initialized")
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
    Track a unique visitor by IP address.
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
                # Update daily stats
                await conn.execute("""
                    INSERT INTO daily_stats (stat_date, total_visitors)
                    VALUES (CURRENT_DATE, 1)
                    ON CONFLICT (stat_date) 
                    DO UPDATE SET total_visitors = daily_stats.total_visitors + 1
                """)
            
            return is_new
    except Exception as e:
        print(f"Error tracking visitor: {e}")
        return False


async def get_daily_stats(days: int = 30) -> List[Dict[str, Any]]:
    """Get daily visitor statistics for the last N days."""
    if not db_pool:
        return []
    
    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT stat_date, total_visitors
                FROM daily_stats
                WHERE stat_date >= CURRENT_DATE - $1
                ORDER BY stat_date DESC
            """, days)
            
            return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return []


async def get_total_visitors() -> int:
    """Get total unique visitors across all time."""
    if not db_pool:
        return 0
    
    try:
        async with db_pool.acquire() as conn:
            result = await conn.fetchval("""
                SELECT COUNT(DISTINCT ip_address)
                FROM unique_visitors
            """)
            return result or 0
    except Exception as e:
        print(f"Error fetching total visitors: {e}")
        return 0


async def submit_feedback(
    name: str,
    building: str,
    improvements: str,
    features: str
) -> Optional[int]:
    """
    Submit user feedback.
    Returns the feedback ID if successful, None otherwise.
    """
    if not db_pool:
        return None
    
    try:
        async with db_pool.acquire() as conn:
            feedback_id = await conn.fetchval("""
                INSERT INTO feedback (name, building, improvements, features)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            """, name, building, improvements, features)
            
            return feedback_id
    except Exception as e:
        print(f"Error submitting feedback: {e}")
        return None


async def get_recent_feedback(limit: int = 50) -> List[Dict[str, Any]]:
    """Get recent feedback submissions."""
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
            
            return [dict(row) for row in rows]
    except Exception as e:
        print(f"Error fetching feedback: {e}")
        return []


async def get_analytics_summary() -> Dict[str, Any]:
    """Get a summary of analytics data."""
    if not db_pool:
        return {
            "enabled": False,
            "total_visitors": 0,
            "today_visitors": 0,
            "total_feedback": 0
        }
    
    try:
        async with db_pool.acquire() as conn:
            # Get total unique visitors
            total = await conn.fetchval("""
                SELECT COUNT(DISTINCT ip_address)
                FROM unique_visitors
            """) or 0
            
            # Get today's visitors
            today = await conn.fetchval("""
                SELECT total_visitors
                FROM daily_stats
                WHERE stat_date = CURRENT_DATE
            """) or 0
            
            # Get total feedback count
            feedback_count = await conn.fetchval("""
                SELECT COUNT(*)
                FROM feedback
            """) or 0
            
            return {
                "enabled": True,
                "total_visitors": total,
                "today_visitors": today,
                "total_feedback": feedback_count
            }
    except Exception as e:
        print(f"Error fetching analytics summary: {e}")
        return {
            "enabled": False,
            "total_visitors": 0,
            "today_visitors": 0,
            "total_feedback": 0
        }
