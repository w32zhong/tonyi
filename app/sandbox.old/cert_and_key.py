import datetime
import uuid

from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa


class CertificateFactory:
    def __init__(self):
        self.expiry = 3650  # 10 years

    @staticmethod
    def new_private_key():
        return rsa.generate_private_key(public_exponent=65537, key_size=4096)

    def pem_format(self, obj):
        if isinstance(obj, rsa.RSAPrivateKey):
            return obj.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption() # as plain string
            ).decode('utf-8')
        else:
            return obj.public_bytes(serialization.Encoding.PEM).decode('utf-8')

    def create_ca(self, common_name):
        ca_key = self.new_private_key()
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ])

        ca_cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer # self signing (subject == issuer)
        ).public_key(
            ca_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.now(datetime.UTC)
        ).not_valid_after(
            datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=self.expiry)
        ).add_extension(
            # allow this key to sign other public keys, i.e, to be used as CA key
            x509.BasicConstraints(ca=True, path_length=None), critical=True
        ).sign(
            # sign this cert hash with self private key
            ca_key, hashes.SHA256()
        )

        return ca_key, ca_cert

    def sign_node(self, ca_key, ca_cert_subject, common_name, is_server=True):
        """
        is_server=True:  for sandbox (Server Auth)
        is_server=False: for gateway (Client Auth)
        """
        node_key = self.new_private_key()

        subject = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ])

        node_cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            ca_cert_subject
        ).public_key(
            node_key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.now(datetime.UTC)
        ).not_valid_after(
            datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=self.expiry)
        ).add_extension(
            x509.ExtendedKeyUsage([
                # OID_CLIENT_AUTH: it is a mTLS client-side certificate
                x509.OID_SERVER_AUTH if is_server else x509.OID_CLIENT_AUTH
            ]), critical=True
        ).sign(
            # sign this cert hash with CA private key
            ca_key, hashes.SHA256()
        )

        return self.pem_format(node_key), self.pem_format(node_cert)


# APISIX gateway config:
# apisix:
#   ssl:
#     ssl_trusted_certificate: /path/to/ca.crt
# POST http://127.0.0.1:9180/apisix/admin/routes/sandbox-8848
#{
#  "uri": "/sandbox/8848/*",
#  "upstream": {
#    "scheme": "https",
#    "nodes": {
#      "34.13.xx.xx:443": 1
#    },
#    "tls": {
#      "client_cert": "(gateway.crt content here)",
#      "client_key": "(gateway.key content here)"
#    }
#  }
#}

# Sandbox nginx config:
# ssl_certificate /path/to/sandbox.crt;
# ssl_certificate_key /path/to/sandbox.key;
#
# ssl_verify_client on;
# ssl_client_certificate /path/to/ca.crt;
#
# location / {
#     if ($ssl_client_verify != SUCCESS) {
#         return 403 "Forbidden: Invalid Client Certificate\n";
#     }
#
#     proxy_pass http://protected_service:3000;

factory = CertificateFactory()

ca_key, ca_cert = factory.create_ca(u"Gateway-Sandbox mTLS CA")
ca_pem = factory.pem_format(ca_cert)

gateway_key_pem, gateway_crt_pem = factory.sign_node(
    ca_key,
    ca_cert.subject,
    u"Gateway",
    is_server=False
)

sandbox_id = "sandbox-8848"
sandbox_key_pem, sandbox_crt_pem = factory.sign_node(
    ca_key,
    ca_cert.subject,
    f"Sandbox#{sandbox_id}"
)

# use ca_key to sign new sandboxs in the future!

# Summary:
# .crt: The Certified ID with your Photo
# .key: Your Face
# After verify and handshake, agree on a OTP for fast symmetric encrypted conversations.
