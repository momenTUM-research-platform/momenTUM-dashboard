import pytest

from conftest import login

pytestmark = pytest.mark.asyncio


async def test_registered_routes_require_auth_and_study_access(setup, monkeypatch):
    client, _, _, app = setup
    import pymongo
    from unittest.mock import MagicMock
    monkeypatch.setattr(pymongo, "MongoClient", MagicMock())
    import main

    app.include_router(main.app.router)
    researcher = await login(client, "researcher")
    protected = ["/api/study-id=unassigned", "/api/studies_responses_grouped/unassigned",
                 "/api/studies/unassigned/metadata", "/api/v2/calendar-notes?study_id=unassigned"]
    for path in protected:
        assert (await client.get(path)).status_code == 401, path
        assert (await client.get(path, headers=researcher)).status_code == 403, path
    assert (await client.get("/api/studies_suggestions?query=test")).status_code == 401
    for method in [client.post, client.delete]:
        response = await method("/api/user/studies", headers=researcher)
        assert response.status_code == 403
    assert (await client.get("/api/auth/me", headers=researcher)).json()["studies"] == ["assigned"]


async def test_study_list_and_suggestions_are_filtered(setup, monkeypatch):
    client, _, _, app = setup
    import pymongo
    from unittest.mock import MagicMock
    monkeypatch.setattr(pymongo, "MongoClient", MagicMock())
    import main
    import partial_search

    class Cursor(list):
        def limit(self, count):
            return self[:count]

    class Collection:
        queries = []

        def find(self, query, **kwargs):
            self.queries.append(query)
            return Cursor([{"properties": {"study_id": "assigned", "study_name": "Assigned"}}])

    collection = Collection()
    monkeypatch.setattr(main, "studies_collection", collection)
    monkeypatch.setattr(partial_search, "studies_collection", collection)
    app.include_router(main.app.router)
    researcher = await login(client, "researcher")
    assert (await client.get("/api/studies", headers=researcher)).status_code == 200
    assert collection.queries[-1]["properties.study_id"] == {"$in": ["assigned"]}
    assert (await client.get("/api/studies_suggestions?query=test", headers=researcher)).status_code == 200
    assert collection.queries[-1]["properties.study_id"] == {"$in": ["assigned"]}
