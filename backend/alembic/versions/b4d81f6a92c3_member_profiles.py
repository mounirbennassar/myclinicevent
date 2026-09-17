"""member profiles and member-linked registrations

Revision ID: b4d81f6a92c3
Revises: 71d918698570
Create Date: 2026-09-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4d81f6a92c3'
down_revision: Union[str, Sequence[str], None] = '71d918698570'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'member_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('mobile', sa.String(length=32), nullable=False),
        sa.Column('scfhs_number', sa.String(length=40), nullable=False),
        sa.Column('national_id', sa.String(length=20), nullable=False),
        sa.Column('profession', sa.String(length=40), nullable=True),
        sa.Column('sponsor_consent', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('consent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
        sa.UniqueConstraint('national_id'),
    )
    op.add_column('registrations', sa.Column('member_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_registrations_member_id'), 'registrations', ['member_id'], unique=False)
    op.create_foreign_key(
        'fk_registrations_member_id', 'registrations', 'users', ['member_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_registrations_member_id', 'registrations', type_='foreignkey')
    op.drop_index(op.f('ix_registrations_member_id'), table_name='registrations')
    op.drop_column('registrations', 'member_id')
    op.drop_table('member_profiles')
