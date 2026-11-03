import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

import auth
from models import AccountInvitation, User, UserAccessAudit
from conftest import login

pytestmark = pytest.mark.asyncio


def details(username="newuser"):
    return {"username": username, "name": "New", "surname": "User",
            "email": f"{username}@example.org", "role": "user"}


async def test_existing_login_and_legacy_token(setup):
    client, _, _, _ = setup
    headers = await login(client, "researcher")
    assert (await client.get("/api/auth/me", headers=headers)).json()["studies"] == ["assigned"]
    token = auth.create_access_token({"sub": "researcher"})
    assert (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})).status_code == 200


async def test_self_service_and_admin_boundaries(setup):
    client, _, _, _ = setup
    headers = await login(client, "researcher")
    for path, body in [("/api/auth/create-user", {**details(), "password": "CreatedPass1"}),
                       ("/api/auth/invite-user", details()),
                       ("/api/auth/users/3/reset-invitation", {})]:
        assert (await client.post(path, headers=headers, json=body)).status_code == 403
    assert (await client.patch("/api/auth/change-password", headers=headers,
                              json={"current_password": "ExistingPass1", "new_password": "ChangedPass1"})).status_code == 403
    assert (await client.get("/api/auth/check-username?username=admin")).status_code == 401
    assert (await client.get("/api/auth/check-username?username=admin", headers=await login(client))).status_code == 200


async def test_invite_pending_single_use_and_stored_hash(setup):
    client, sessions, sent, _ = setup
    headers = await login(client)
    response = await client.post("/api/auth/invite-user", json=details(), headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["user"]["password_set"] is False
    token = sent[-1]["token"]
    async with sessions() as db:
        invitation = (await db.execute(select(AccountInvitation))).scalar_one()
        assert invitation.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert invitation.token_hash != token
    assert (await client.post("/api/auth/login", data={"username": "newuser", "password": "ExistingPass1"})).status_code == 401
    body = {"token": token, "password": "NewPassword1"}
    assert (await client.post("/api/auth/set-password", json=body)).status_code == 200
    assert (await client.post("/api/auth/set-password", json=body)).status_code == 400
    await login(client, "newuser", "NewPassword1")


async def test_resend_invalidates_old_link_and_expiry(setup):
    client, sessions, sent, _ = setup
    headers = await login(client)
    response = await client.post("/api/auth/invite-user", json=details(), headers=headers)
    user_id = response.json()["user"]["id"]
    old_token = sent[-1]["token"]
    assert (await client.post(f"/api/auth/users/{user_id}/invitation", headers=headers)).status_code == 200
    assert (await client.post("/api/auth/set-password", json={"token": old_token, "password": "NewPassword1"})).status_code == 400
    async with sessions() as db:
        invitation = (await db.execute(select(AccountInvitation).where(AccountInvitation.used_at.is_(None)))).scalar_one()
        invitation.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    assert (await client.post("/api/auth/set-password", json={"token": sent[-1]["token"], "password": "NewPassword1"})).status_code == 400


async def test_reset_revokes_sessions_and_outstanding_links(setup):
    client, _, sent, _ = setup
    admin = await login(client)
    researcher = await login(client, "researcher")
    await client.post("/api/auth/users/2/reset-invitation", headers=admin)
    token = sent[-1]["token"]
    assert (await client.patch("/api/auth/users/2/reset-password", headers=admin,
                              json={"new_password": "AdminReset1"})).status_code == 200
    assert (await client.get("/api/auth/me", headers=researcher)).status_code == 401
    assert (await client.post("/api/auth/set-password", json={"token": token, "password": "NewPassword1"})).status_code == 400
    await login(client, "researcher", "AdminReset1")


async def test_email_reset_revokes_sessions_on_redemption(setup):
    client, _, sent, _ = setup
    admin = await login(client)
    researcher = await login(client, "researcher")
    await client.post("/api/auth/users/2/reset-invitation", headers=admin)
    assert (await client.get("/api/auth/me", headers=researcher)).status_code == 200
    assert (await client.post("/api/auth/set-password", json={"token": sent[-1]["token"], "password": "NewPassword1"})).status_code == 200
    assert (await client.get("/api/auth/me", headers=researcher)).status_code == 401
    await login(client, "researcher", "NewPassword1")


async def test_suspend_reactivate_does_not_restore_old_sessions(setup):
    client, _, _, _ = setup
    admin = await login(client)
    researcher = await login(client, "researcher")
    for active in [False, True]:
        response = await client.patch("/api/auth/users/2/status", headers=admin, json={"is_active": active})
        assert response.status_code == 200
        assert (await client.get("/api/auth/me", headers=researcher)).status_code == 401
        if not active:
            assert (await client.post("/api/auth/login", data={"username": "researcher", "password": "ExistingPass1"})).status_code == 401
    await login(client, "researcher")
    assert (await client.patch("/api/auth/users/1/status", headers=admin, json={"is_active": False})).status_code == 403


async def test_preview_permissions_write_protection_and_audit(setup):
    client, sessions, _, app = setup
    from fastapi import Depends
    from models import User

    @app.get("/api/test/{study_id}")
    async def study(_user: User = Depends(auth.require_study_access)):
        return {"ok": True}

    admin = await login(client)
    assert (await client.post("/api/auth/users/1/preview", headers=admin)).status_code == 400
    response = await client.post("/api/auth/users/2/preview", headers=admin)
    preview = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert (await client.get("/api/auth/me", headers=preview)).json()["username"] == "researcher"
    assert (await client.get("/api/test/assigned", headers=preview)).status_code == 200
    assert (await client.get("/api/test/unassigned", headers=preview)).status_code == 403
    assert (await client.patch("/api/auth/change-password", headers=preview, json={})).status_code == 403
    assert (await client.post("/api/auth/users/3/preview", headers=preview)).status_code == 403
    assert (await client.post("/api/auth/preview/end", headers=preview)).status_code == 200
    assert (await client.get("/api/auth/me", headers=preview)).status_code == 401
    assert (await client.get("/api/auth/me", headers=admin)).status_code == 200
    async with sessions() as db:
        audit = (await db.execute(select(UserAccessAudit))).scalar_one()
        assert audit.actor_id == 1 and audit.target_id == 2 and audit.ended_at is not None


async def test_preview_revoked_when_admin_suspended(setup):
    client, sessions, _, _ = setup
    admin = await login(client)
    response = await client.post("/api/auth/users/2/preview", headers=admin)
    preview = {"Authorization": f"Bearer {response.json()['access_token']}"}
    async with sessions() as db:
        actor = await db.get(User, 1)
        actor.is_active = False
        await db.commit()
    assert (await client.get("/api/auth/me", headers=preview)).status_code == 401


async def test_failed_mail_keeps_pending_account_and_revokes_link(setup, monkeypatch):
    client, sessions, _, _ = setup

    async def fail(*args):
        raise auth.MailDeliveryError("Email delivery failed")

    monkeypatch.setattr(auth, "send_invitation", fail)
    response = await client.post("/api/auth/invite-user", json=details(), headers=await login(client))
    assert response.status_code == 502
    async with sessions() as db:
        invitation = (await db.execute(select(AccountInvitation))).scalar_one()
        assert invitation.used_at is not None
        user = await db.get(User, invitation.user_id)
        assert not user.password_set


async def test_validation_and_email_change_invalidates_links(setup):
    client, _, sent, _ = setup
    admin = await login(client)
    assert (await client.post("/api/auth/invite-user", json={**details(), "role": "superuser"}, headers=admin)).status_code == 422
    assert (await client.post("/api/auth/invite-user", json={**details(), "email": "invalid"}, headers=admin)).status_code == 422
    assert (await client.post("/api/auth/invite-user", json={**details(), "email": "ADMIN@example.org"}, headers=admin)).status_code == 409
    await client.post("/api/auth/users/2/reset-invitation", headers=admin)
    assert (await client.patch("/api/auth/users/2", json={"email": "changed@example.org"}, headers=admin)).status_code == 200
    assert (await client.post("/api/auth/set-password", json={"token": sent[-1]["token"], "password": "NewPassword1"})).status_code == 400


async def test_concurrent_redemption_is_single_use(setup):
    import asyncio
    import os
    if not os.environ["DATABASE_URL"].startswith("postgresql"):
        pytest.skip("Requires PostgreSQL row locks")
    client, _, sent, _ = setup
    await client.post("/api/auth/invite-user", json=details(), headers=await login(client))
    body = {"token": sent[-1]["token"], "password": "NewPassword1"}
    responses = await asyncio.gather(*[client.post("/api/auth/set-password", json=body) for _ in range(2)])
    assert sorted(response.status_code for response in responses) == [200, 400]


async def test_manual_creation_and_pending_account_deletion(setup):
    client, sessions, _, _ = setup
    admin = await login(client)
    response = await client.post("/api/auth/create-user", headers=admin,
                                 json={**details("manual"), "password": "ManualPass1"})
    assert response.status_code == 200, response.text
    assert response.json()["user"]["password_set"]
    await login(client, "manual", "ManualPass1")
    response = await client.post("/api/auth/invite-user", headers=admin, json=details("pending"))
    user_id = response.json()["user"]["id"]
    assert (await client.delete(f"/api/auth/users/{user_id}", headers=admin)).status_code == 200
    async with sessions() as db:
        assert (await db.execute(select(AccountInvitation).where(AccountInvitation.user_id == user_id))).scalars().all() == []


async def test_preview_rejects_target_promoted_to_admin(setup):
    client, sessions, _, _ = setup
    admin = await login(client)
    response = await client.post("/api/auth/users/2/preview", headers=admin)
    preview = {"Authorization": f"Bearer {response.json()['access_token']}"}
    async with sessions() as db:
        user = await db.get(User, 2)
        user.role = "admin"
        await db.commit()
    assert (await client.get("/api/auth/me", headers=preview)).status_code == 401


async def test_copy_link_invitation_needs_no_mail_configuration(setup, monkeypatch):
    from urllib.parse import parse_qs, urlsplit
    monkeypatch.delenv("DASHBOARD_PUBLIC_URL", raising=False)
    client, sessions, sent, _ = setup
    admin = await login(client)
    response = await client.post("/api/auth/invite-user", headers=admin,
                                 json={**details(), "delivery": "link"})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert sent == []
    assert data["setup_path"].startswith("/set-password#token=")
    token = parse_qs(urlsplit(data["setup_path"]).fragment)["token"][0]
    async with sessions() as db:
        invitation = (await db.execute(select(AccountInvitation))).scalar_one()
        assert invitation.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert (await client.get("/api/auth/users", headers=admin)).text.find(token) == -1
    body = {"token": token, "password": "NewPassword1"}
    assert (await client.post("/api/auth/set-password", json=body)).status_code == 200
    assert (await client.post("/api/auth/set-password", json=body)).status_code == 400
    await login(client, "newuser", "NewPassword1")


async def test_copy_link_replacement_expiry_and_admin_boundary(setup):
    from urllib.parse import parse_qs, urlsplit
    client, sessions, sent, _ = setup
    admin = await login(client)
    researcher = await login(client, "researcher")
    endpoint = "/api/auth/users/2/reset-invitation"
    assert (await client.post(endpoint, headers=researcher, json={"delivery": "link"})).status_code == 403
    assert (await client.post(endpoint, json={"delivery": "link"})).status_code == 401
    first = (await client.post(endpoint, headers=admin, json={"delivery": "link"})).json()
    second = (await client.post(endpoint, headers=admin, json={"delivery": "link"})).json()
    token = lambda result: parse_qs(urlsplit(result["setup_path"]).fragment)["token"][0]
    assert first["setup_path"] != second["setup_path"] and sent == []
    assert (await client.post("/api/auth/set-password", json={"token": token(first), "password": "NewPassword1"})).status_code == 400
    async with sessions() as db:
        invitation = (await db.execute(select(AccountInvitation).where(AccountInvitation.used_at.is_(None)))).scalar_one()
        invitation.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    assert (await client.post("/api/auth/set-password", json={"token": token(second), "password": "NewPassword1"})).status_code == 400
    assert (await client.get("/api/auth/me", headers=researcher)).status_code == 200


async def test_pending_account_link_can_be_replaced_without_email(setup):
    client, _, sent, _ = setup
    admin = await login(client)
    response = await client.post("/api/auth/invite-user", headers=admin,
                                 json={**details(), "delivery": "link"})
    endpoint = f"/api/auth/users/{response.json()['user']['id']}/invitation"
    replacement = await client.post(endpoint, headers=admin, json={"delivery": "link"})
    assert replacement.status_code == 200
    assert replacement.json()["setup_path"] != response.json()["setup_path"]
    assert sent == []
    assert (await client.post(endpoint, headers=admin, json={"delivery": "unknown"})).status_code == 422
