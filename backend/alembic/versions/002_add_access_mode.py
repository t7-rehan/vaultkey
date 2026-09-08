"""add_access_mode_to_shares

Revision ID: 002
Revises: 001
Create Date: 2026-09-07

Adds an access_mode column to the shares table.

Values:
  'download'  – legacy/default; recipient may download the decrypted file.
  'view_only' – backend rejects the download API call; frontend shows the
                restricted in-browser viewer only.

Existing rows are backfilled to 'download' to preserve current behaviour.
"""
from alembic import op
import sqlalchemy as sa


revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'shares',
        sa.Column(
            'access_mode',
            sa.String(length=20),
            nullable=False,
            server_default='download',
        ),
    )


def downgrade() -> None:
    op.drop_column('shares', 'access_mode')
