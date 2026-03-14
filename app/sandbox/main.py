import os
import datetime
from libcloud.compute.types import Provider
from libcloud.compute.providers import get_driver
from libcloud.compute.deployment import ScriptDeployment

# Reference: https://github.com/apache/libcloud/blob/trunk/demos/gce_demo.py

service_account_email = "40679009188-compute@developer.gserviceaccount.com"
service_account_json = "../../secrets/google_service_account.json"
project_id = "united-storm-489917-a3"
cloud_init_path = './cloud-init/gcp-ubuntu-min-questing.yml'
pub_key_path = os.path.expanduser("~/.ssh/id_rsa.pub")

def main():
    with open(cloud_init_path, 'r') as cloud_init_file:
        cloud_init = cloud_init_file.read()

    with open(pub_key_path) as pub_key_file:
        pub_key_content = pub_key_file.read().strip()

    ComputeEngine = get_driver(Provider.GCE)
    driver = ComputeEngine(
        service_account_email,
        service_account_json,
        project=project_id,
        datacenter="northamerica-northeast2-b",
    )
    nodes = driver.list_nodes()
    print("Nodes:", nodes)
    for node in nodes:
        node.destroy()

    images = driver.list_images()
    sizes = driver.list_sizes()
    image = [i for i in images if i.name == "ubuntu-minimal-2510-questing-amd64-v20260225"][0]
    size = [s for s in sizes if s.name == "e2-medium"][0]
    print(image)
    print(size)

    ex_metadata = {
        "items": [
            {"key": "user-data", "value": cloud_init},
            {"key": "ssh-keys", "value": f"sandbox:{pub_key_content}"}
        ]
    }

    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

    node = driver.create_node(
        name=f"sandbox-{timestamp}",
        image=image,
        size=size,
        ex_metadata=ex_metadata,
        ex_tags=['http-server', 'https-server'],
        ex_disk_auto_delete=True
    )


if __name__ == "__main__":
    main()
