"""
Cloudflare R2 storage module for VaultKey.

R2 exposes an S3-compatible API, so we use boto3 with a custom endpoint.
All public surface:
  - upload_file(key, data, content_type) -> None
  - download_file(key) -> bytes
  - delete_file(key) -> None
  - generate_object_key() -> str
"""

import os
import uuid
import boto3
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

# ── Client (lazy singleton) ────────────────────────────────────────────────────

_s3_client = None


def _get_client():
    global _s3_client
    if _s3_client is None:
        account_id = os.environ.get("R2_ACCOUNT_ID")
        access_key = os.environ.get("R2_ACCESS_KEY_ID")
        secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
        bucket_name = os.environ.get("R2_BUCKET_NAME")

        missing = [
            name for name, val in {
                "R2_ACCOUNT_ID": account_id,
                "R2_ACCESS_KEY_ID": access_key,
                "R2_SECRET_ACCESS_KEY": secret_key,
                "R2_BUCKET_NAME": bucket_name,
            }.items()
            if not val
        ]

        if missing:
            raise RuntimeError(
                f"Missing required R2 environment variables: {', '.join(missing)}"
            )

        endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
        _s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",  # R2 uses 'auto' as the region
        )
    return _s3_client


def _get_bucket_name() -> str:
    return os.environ.get("R2_BUCKET_NAME", "vaultkey-files")


# ── Public helpers ─────────────────────────────────────────────────────────────

def generate_object_key() -> str:
    """Return a random, non-guessable R2 object key for an encrypted file."""
    return f"uploads/{uuid.uuid4().hex}.enc"


def upload_file(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    """Upload raw bytes to R2 under the given key."""
    try:
        _get_client().put_object(
            Bucket=_get_bucket_name(),
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    except ClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to upload file to storage: {exc.response['Error']['Message']}",
        ) from exc


def download_file(key: str) -> bytes:
    """Download an object from R2 and return its raw bytes."""
    try:
        response = _get_client().get_object(Bucket=_get_bucket_name(), Key=key)
        return response["Body"].read()
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in ("NoSuchKey", "404"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Encrypted file payload missing.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to retrieve file from storage: {exc.response.get('Error', {}).get('Message', str(exc))}",
        ) from exc


def delete_file(key: str) -> None:
    """Delete an object from R2. Silently ignores missing keys."""
    try:
        _get_client().delete_object(Bucket=_get_bucket_name(), Key=key)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in ("NoSuchKey", "404"):
            return  # already gone — treat as success
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to delete file from storage: {exc.response.get('Error', {}).get('Message', str(exc))}",
        ) from exc
