import os
import asyncio
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession
from database import engine, async_session  # Ensure these are set in your database.py
from models import User, Base
from crud import get_user_by_username, pwd_context
load_dotenv()

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
if not ADMIN_PASSWORD:
    raise Exception("ADMIN_PASSWORD environment variable is not set!")
ADMIN_ROLE = os.getenv("ADMIN_ROLE", "admin")
# Optional additional fields for the admin user:
ADMIN_NAME = os.getenv("ADMIN_NAME", "Primary")
ADMIN_SURNAME = os.getenv("ADMIN_SURNAME", "Admin")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@example.com")

async def init_database():
    # Create all tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database schema ensured.")

async def init_admin():
    async with async_session() as db:
        admin = await get_user_by_username(db, ADMIN_USERNAME)
        if admin is None:
            print("No admin user found. Creating default admin user...")
            hashed_password = pwd_context.hash(ADMIN_PASSWORD)
            new_admin = User(
                username=ADMIN_USERNAME,
                hashed_password=hashed_password,
                role=ADMIN_ROLE,
                name=ADMIN_NAME,
                surname=ADMIN_SURNAME,
                email=ADMIN_EMAIL,
                studies=[]  # Initially no associated studies
            )
            db.add(new_admin)
            await db.commit()
            await db.refresh(new_admin)
            print(f"Admin user '{ADMIN_USERNAME}' created.")
        else:
            print(f"Admin user '{ADMIN_USERNAME}' already exists.")

async def main():
    await init_database()  # Ensure that the schema is created
    await init_admin()     # Seed the admin user if not present

if __name__ == "__main__":
    asyncio.run(main())
