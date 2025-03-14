from fastapi import FastAPI, Depends, Body, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from auth import router as auth_router, oauth2_scheme, SECRET_KEY, ALGORITHM, pwd_context
from database import get_db
from crud import get_user_by_username
from mock_studies import mock_studies
from studies_test import router as studies_test_router
from studies_responses_grouped import router as responses_grouped

app = FastAPI()
app.include_router(auth_router, prefix="/api")
app.include_router(studies_test_router, prefix="/api")
app.include_router(responses_grouped, prefix="/api")

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

@app.get("/api/hello")
def read_root():
    return {"message": "Hello from FastAPI"}

@app.get("/api/dashboard")
async def get_dashboard_data(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_study_ids = user.studies or []
    user_studies = [mock_studies.get(sid) for sid in user_study_ids if mock_studies.get(sid)]
    
    return {
        "surveys": user_studies,
        "user_stats": {
            "last_login": "2025-02-24T15:30:00Z",
            "notifications": 2,
        },
        "info": "Mock data for demonstration purposes."
    }

@app.post("/api/user/studies")
async def add_user_studies(
    study_ids: list[int] = Body(..., embed=True),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = await get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.studies = study_ids
    await db.commit()
    await db.refresh(user)
    return {"username": username, "studies": user.studies}

@app.get("/api/studies")
def get_all_studies():
    return list(mock_studies.values())
