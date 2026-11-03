import importlib.util
import os
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


@pytest.mark.parametrize("existing", [False, True])
def test_migration_preserves_existing_accounts(existing):
    url = os.getenv("AUTH_TEST_SYNC_DATABASE_URL", "sqlite:///:memory:")
    engine = sa.create_engine(url)
    metadata = sa.MetaData()
    legacy = sa.Table(
        "user", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String, nullable=False, unique=True),
        sa.Column("hashed_password", sa.String, nullable=False),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("surname", sa.String, nullable=False),
        sa.Column("email", sa.String, nullable=False, unique=True),
        sa.Column("role", sa.String, nullable=False),
        sa.Column("studies", sa.JSON),
    )
    path = Path(__file__).parents[1] / "alembic/versions/b7e230a1d952_account_invitations.py"
    spec = importlib.util.spec_from_file_location("account_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        for table in ["accountinvitation", "useraccessaudit", "user"]:
            connection.execute(sa.text(f'DROP TABLE IF EXISTS "{table}"'))
        if existing:
            metadata.create_all(connection)
            connection.execute(legacy.insert().values(id=1, username="existing", name="Existing",
                surname="User", email="existing@example.org", role="user",
                hashed_password="unchanged-password-hash", studies=["assigned"]))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        current = sa.Table("user", sa.MetaData(), autoload_with=connection)
        assert {"accountinvitation", "useraccessaudit", "user"} <= set(sa.inspect(connection).get_table_names())
        if existing:
            row = connection.execute(sa.select(current)).mappings().one()
            assert row["hashed_password"] == "unchanged-password-hash"
            assert row["username"] == "existing" and row["studies"] == ["assigned"]
            assert row["is_active"] and row["password_set"] and row["session_version"] == 0
        else:
            assert connection.execute(sa.select(sa.func.count()).select_from(current)).scalar() == 0
    engine.dispose()
