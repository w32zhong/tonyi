import os
import datetime
from libcloud.compute.types import Provider
from libcloud.compute.providers import get_driver
from rq import get_current_job

# Configs - Hardcoded for quick helloworld, matching old main.py
service_account_email = "40679009188-compute@developer.gserviceaccount.com"
service_account_json = "../../secrets/google_service_account.json"
project_id = "united-storm-489917-a3"
cloud_init_path = './cloud-init/gcp-ubuntu-min-questing.yml'
pub_key_path = os.path.expanduser("~/.ssh/id_rsa.pub")

def task_provision_gce():
    """
    This function will be executed by the RQ worker in a separate process.
    RQ natively supports synchronous functions, so we don't need asyncio wrappers.
    """
    job = get_current_job()

    def update_progress(msg):
        print(msg)
        if job:
            job.meta['progress'] = msg
            job.save_meta()

    update_progress("Reading cloud-init and pub_key...")
    # Get absolute paths relative to where the worker runs, 
    # but for simplicity assuming the worker runs from app/sandbox
    base_dir = os.path.dirname(__file__)
    actual_cloud_init_path = os.path.join(base_dir, cloud_init_path)
    actual_sa_json_path = os.path.join(base_dir, service_account_json)

    with open(actual_cloud_init_path, 'r') as cloud_init_file:
        cloud_init = cloud_init_file.read()

    with open(pub_key_path) as pub_key_file:
        pub_key_content = pub_key_file.read().strip()

    update_progress("Connecting to GCE...")
    ComputeEngine = get_driver(Provider.GCE)
    driver = ComputeEngine(
        service_account_email,
        actual_sa_json_path,
        project=project_id,
        datacenter="northamerica-northeast2-b",
    )
    
    update_progress("Listing existing nodes and destroying them (as per original logic)...")
    nodes = driver.list_nodes()
    for node in nodes:
        node.destroy()

    update_progress("Fetching images and sizes...")
    images = driver.list_images()
    sizes = driver.list_sizes()
    
    # Match dynamically using the prefix and return the first matching image
    try:
        image = next(i for i in images if i.name.startswith("ubuntu-minimal-2510-questing-amd64"))
    except StopIteration:
        raise ValueError("Could not find an image starting with 'ubuntu-minimal-2510-questing-amd64'")
    
    size = next(s for s in sizes if s.name == "e2-medium")

    ex_metadata = {
        "items": [
            {"key": "user-data", "value": cloud_init},
            {"key": "ssh-keys", "value": f"sandbox:{pub_key_content}"}
        ]
    }

    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    node_name = f"sandbox-{timestamp}"
    
    if job:
        job.meta['node_name'] = node_name
        job.save_meta()
    
    try:
        update_progress(f"Creating new node {node_name}...")
        node = driver.create_node(
            name=node_name,
            image=image,
            size=size,
            ex_metadata=ex_metadata,
            ex_tags=['http-server', 'https-server'],
            ex_disk_auto_delete=True
        )
        
        public_ips = node.public_ips
        private_ips = node.private_ips
        update_progress(f"Node created successfully! IPs: {public_ips}, {private_ips}")
        
        # Return value will be stored in Redis by RQ and accessible via job.result
        return {"name": node_name, "public_ips": public_ips, "private_ips": private_ips}

    except Exception as e:
        update_progress(f"Provisioning failed: {str(e)}. Attempting cleanup...")
        try:
            # Re-fetch nodes to find the partially created one
            current_nodes = driver.list_nodes()
            for n in current_nodes:
                if n.name == node_name:
                    n.destroy()
                    update_progress(f"Cleanup: Destroyed node {node_name}")
        except Exception as cleanup_err:
            update_progress(f"Cleanup failed: {str(cleanup_err)}")
        
        raise # re-raise the exception so the job is marked as failed in RQ


def task_teardown_gce(node_name: str):
    """
    Dedicated task to destroy a specific GCE node by name.
    """
    job = get_current_job()
    def update_progress(msg):
        print(msg)
        if job:
            job.meta['progress'] = msg
            job.save_meta()

    update_progress(f"Starting teardown for node {node_name}...")
    base_dir = os.path.dirname(__file__)
    actual_sa_json_path = os.path.join(base_dir, service_account_json)

    ComputeEngine = get_driver(Provider.GCE)
    driver = ComputeEngine(
        service_account_email,
        actual_sa_json_path,
        project=project_id,
        datacenter="northamerica-northeast2-b",
    )

    update_progress("Finding node...")
    nodes = driver.list_nodes()
    for n in nodes:
        if n.name == node_name:
            update_progress(f"Node found, destroying {node_name}...")
            n.destroy()
            update_progress("Node destroyed successfully.")
            return {"status": "destroyed", "name": node_name}
    
    update_progress(f"Node {node_name} not found, maybe already destroyed.")
    return {"status": "not_found", "name": node_name}
