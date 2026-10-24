"""Generate the tool keypair for registration, keeping private material off stdout.

Usage: python generate_lti_key.py /secure/path/eduthemes-lti-private.pem
The launch-only integration publishes the public key; it never calls signed services.
"""
import json
import os
import sys
from uuid import uuid4

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python generate_lti_key.py /secure/path/private.pem')
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    # Refuse to overwrite an existing key; create with owner-only permissions.
    descriptor = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as target:
        target.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                       serialization.NoEncryption()))
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
    public.update(kid=str(uuid4()), alg='RS256', use='sig')
    print(json.dumps(public))


if __name__ == '__main__':
    main()
