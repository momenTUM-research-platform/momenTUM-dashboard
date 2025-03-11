from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import User
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def get_user_by_username(db: AsyncSession, username: str):
    result = await db.execute(select(User).where(User.username == username))
    return result.scalars().first()

async def create_user(db: AsyncSession, username: str, password: str, role: str = "user"):
    hashed_password = pwd_context.hash(password)
    user = User(username=username, hashed_password=hashed_password, role=role, studies=[])
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

async def delete_user(db: AsyncSession, user: User):
    await db.delete(user)
    await db.commit()
    return user
