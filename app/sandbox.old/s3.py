import os
import sys
import boto3
from botocore.config import Config

s3_key = os.environ.get("S3_ACCESS_KEY_ID")
s3_secret = os.environ.get("S3_SECRET_ACCESS_KEY")
s3_endpoint = os.environ.get("S3_ENDPOINT")

# R2 requires SigV4 and 'auto' region
# Using boto3.resource for a higher-level, object-oriented interface
s3_resource = boto3.resource(
    service_name='s3',
    aws_access_key_id=s3_key,
    aws_secret_access_key=s3_secret,
    endpoint_url=s3_endpoint,
    region_name='auto',
    config=Config(signature_version='s3v4')
)

try:
    print(f"Listing buckets...")
    buckets = list(s3_resource.buckets.all())
    print(f"Found {len(buckets)} buckets.")
    for bucket in buckets:
        print(f" - {bucket.name}")

    bucket_name = 'foo'
    bucket = s3_resource.Bucket(bucket_name)

    print(f"Ensuring bucket exists: {bucket_name}")
    try:
        bucket.create()
    except Exception:
        # Bucket might already exist
        pass

    folder_name = "my-test-folder/"
    bucket.put_object(Key=folder_name)
    print("Folder created successfully.")

    print(f"Objects in bucket '{bucket_name}':")
    # Using a list to check for contents easily
    objs = list(bucket.objects.all())
    if objs:
        for obj in objs:
            print(f" - {obj.key}")
    else:
        print(" (No objects found)")

    # filter().delete() handles batching and pagination automatically
    bucket.objects.filter(Prefix=folder_name).delete()
    print("Folder and contents deleted successfully.")

except Exception as e:
    print(f"Operations failed: {e}")
    sys.exit(1)
