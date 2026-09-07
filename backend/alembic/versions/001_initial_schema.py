"""initial_schema

Revision ID: 001
Revises: 
Create Date: 2026-09-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=False)

    # Create files table
    op.create_table(
        'files',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('r2_object_key', sa.String(length=512), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=True),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('iv_hex', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_files_owner_id'), 'files', ['owner_id'], unique=False)

    # Create shares table
    op.create_table(
        'shares',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('file_id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('max_downloads', sa.Integer(), nullable=True),
        sa.Column('download_count', sa.Integer(), nullable=True),
        sa.Column('password_hash', sa.String(length=255), nullable=True),
        sa.Column('revoked', sa.Boolean(), nullable=True),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_shares_token_hash'), 'shares', ['token_hash'], unique=False)

    # Create access_logs table
    op.create_table(
        'access_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('share_id', sa.String(length=36), nullable=True),
        sa.Column('file_id', sa.String(length=36), nullable=True),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('event', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column('ip_address', sa.String(length=100), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['file_id'], ['files.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['share_id'], ['shares.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('access_logs')
    op.drop_index(op.f('ix_shares_token_hash'), table_name='shares')
    op.drop_table('shares')
    op.drop_index(op.f('ix_files_owner_id'), table_name='files')
    op.drop_table('files')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
