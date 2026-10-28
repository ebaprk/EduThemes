"""Check current study membership with the caller's Supabase JWT, never a claimed role."""
import os
from uuid import UUID

import httpx
from flask import request


class StudyAccessError(Exception):
    def __init__(self, message, status):
        super().__init__(message)
        self.status = status


def require_study_access(study_id, *, edit=False):
    try:
        UUID(study_id)
    except (ValueError, TypeError, AttributeError):
        raise StudyAccessError('A valid study is required.', 400) from None
    authorization = request.headers.get('Authorization', '')
    if not authorization.startswith('Bearer ') or len(authorization) > 16384:
        raise StudyAccessError('Sign in to access this study analysis.', 401)
    base = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_PUBLISHABLE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    if not base.startswith('https://') or not key:
        raise StudyAccessError('Study access verification is not configured.', 503)
    try:
        response = httpx.post(f'{base}/rest/v1/rpc/study_role',
            headers={'apikey': key, 'Authorization': authorization},
            json={'p_study_id': study_id}, timeout=15)
        if response.status_code == 401:
            raise StudyAccessError('Your researcher sign-in expired. Sign in again.', 401)
        response.raise_for_status()
        role = response.json()
    except (httpx.HTTPError, ValueError):
        raise StudyAccessError('Study access could not be verified. Please retry.', 503) from None
    if role not in ('owner', 'researcher', 'reviewer') or (edit and role == 'reviewer'):
        raise StudyAccessError('You do not have permission to access this study analysis.', 403)
    return role
