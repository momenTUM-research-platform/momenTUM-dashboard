"""Add account lifecycle and invitation records."""
from alembic import op
import sqlalchemy as sa

revision = "b7e230a1d952"
down_revision = "484852f689d1"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("user"):
        op.create_table(
            "user",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("username", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("hashed_password", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("surname", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("role", sa.String(), nullable=False, server_default="user"),
            sa.Column("studies", sa.JSON()),
        )
    columns = {column["name"] for column in sa.inspect(bind).get_columns("user")}
    additions = [
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("password_set", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="0"),
    ]
    for column in additions:
        if column.name not in columns:
            op.add_column("user", column)
    op.create_table(
        "accountinvitation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("purpose", sa.String(), nullable=False),
    )
    op.create_table(
        "useraccessaudit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_id", sa.Integer(), nullable=False, index=True),
        sa.Column("target_id", sa.Integer(), nullable=False, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    raise RuntimeError("Account lifecycle migration requires a reviewed rollback; restore the backup to remove it.")
