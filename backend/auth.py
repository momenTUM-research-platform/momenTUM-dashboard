from fastapi import APIRouter, HTTPException, Depends, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from database import get_db
from models import User
from crud import get_user_by_username, pwd_context, delete_user
from schemas import UserCreate  # Pydantic model with: username, password, name, surname, email, role
import os
from dotenv import load_dotenv


load_dotenv()
router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise Exception("SECRET_KEY environment variable is not set!")
    
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))



oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/auth/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: AsyncSession = Depends(get_db)
):
    user = await get_user_by_username(db, form_data.username)
    if not user or not pwd_context.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/auth/me")
async def read_users_me(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"username": username, "role": payload.get("role")}

def admin_required(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials"
        )

@router.post("/auth/create-user")
async def create_user_endpoint(
    request: UserCreate,
    token: str = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    # Check if a user with this username already exists.
    existing_user = await get_user_by_username(db, request.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Convert the request to a dict, then remove the plain password and hash it.
    user_data = request.dict()
    plain_password = user_data.pop("password")
    user_data["hashed_password"] = pwd_context.hash(plain_password)
    # Ensure studies field is set (will default to an empty list)
    user_data["studies"] = []
    
    # Create the new user using dynamic fields from the schema.
    new_user = User(**user_data)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"message": f"User {new_user.username} created with role {new_user.role}"}

@router.get("/auth/check-username")
async def check_username(username: str, db: AsyncSession = Depends(get_db)):
    existing_user = await get_user_by_username(db, username)
    return {"exists": bool(existing_user)}

@router.get("/auth/users")
async def list_users(
    token: str = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users

@router.delete("/auth/users/{user_id}")
async def delete_user_endpoint(
    user_id: int,
    token: str = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Prevent deletion of the main admin user (for example, username "admin")
    if user.username.lower() == "admin":
        raise HTTPException(status_code=403, detail="Cannot delete the primary admin user")
    await delete_user(db, user)
    return {"message": f"User {user.username} deleted"}

@router.patch("/auth/users/{user_id}")
async def update_user_details(
    user_id: int,
    update: dict = Body(...),
    token: str = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    # Only allow updating name, surname, and email
    allowed_fields = {"name", "surname", "email"}
    update_data = {k: v for k, v in update.items() if k in allowed_fields}
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    # Fetch the user by ID
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update allowed fields
    for key, value in update_data.items():
        setattr(user, key, value)
    
    await db.commit()
    await db.refresh(user)
    
    return {"message": f"User {user.username} updated", "user": user}

@router.patch("/auth/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    new_password: str = Body(..., embed=True),
    token: str = Depends(admin_required),
    db: AsyncSession = Depends(get_db)
):
    # Fetch the user by id
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Validate new password if needed (could use same regex as before)
    regex = r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$"
    if not __import__("re").match(regex, new_password):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long and include uppercase, lowercase, and a number.")
    # Hash and update password
    hashed_password = pwd_context.hash(new_password)
    user.hashed_password = hashed_password
    await db.commit()
    await db.refresh(user)
    return {"message": f"Password for user {user.username} has been reset"}
