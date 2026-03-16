import os
from fastapi import FastAPI, HTTPException, BackgroundTasks
from redis import Redis
from rq import Queue
from rq.job import Job
from rq.exceptions import NoSuchJobError
from rq.command import send_stop_job_command
from task_provision_gce import task_provision_gce, task_teardown_gce

app = FastAPI()

# Setup Redis and RQ
redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
redis_conn = Redis.from_url(redis_url)
task_queue = Queue('default', connection=redis_conn)

@app.post("/api/v1/sandboxes")
def create_sandbox():
    # Dynamically calculate if we have capacity based on registered workers
    from rq import Worker
    
    # 1. Get all active workers
    workers = Worker.all(connection=redis_conn)
    total_workers = len(workers)
    
    # If no workers are running at all, we should still fail fast or accept but queue?
    # Usually better to fail fast if the entire backend is down.
    if total_workers == 0:
        raise HTTPException(
            status_code=503, 
            detail="No provisioning workers are currently available."
        )

    # 2. Count how many workers are currently busy
    # worker.get_state() returns 'busy' or 'idle'
    busy_workers = sum(1 for w in workers if w.get_state() == 'busy')
    
    # 3. Check queue length
    current_queue_len = len(task_queue)

    # Policy: We only accept new jobs if the total jobs (running + queued) 
    # doesn't exceed our total worker capacity by too much.
    # For example, we allow exactly 1 job to queue up per worker.
    MAX_QUEUE_PER_WORKER = 1
    max_allowed_in_queue = total_workers * MAX_QUEUE_PER_WORKER

    if current_queue_len >= max_allowed_in_queue:
        raise HTTPException(
            status_code=503, 
            detail=f"Service is at capacity ({busy_workers}/{total_workers} workers busy, {current_queue_len} in queue). Please try again later."
        )

    # Enqueue the job. 
    job = task_queue.enqueue(task_provision_gce, job_timeout=600)
    
    return {
        "task_id": job.id, 
        "message": "Provisioning enqueued in RQ"
    }

@app.get("/api/v1/sandboxes/{task_id}/status")
def get_status(task_id: str):
    try:
        # Fetch the job by its ID from Redis
        job = Job.fetch(task_id, connection=redis_conn)
    except NoSuchJobError:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "task_id": job.id,
        "status": job.get_status(), # queued, started, finished, failed, deferred, etc.
        "progress": job.meta.get("progress", ""),
        "result": job.result,       # Will be populated when finished
        "error": job.exc_info       # Exception traceback if failed
    }

@app.delete("/api/v1/sandboxes/{task_id}")
def cancel_sandbox(task_id: str):
    try:
        job = Job.fetch(task_id, connection=redis_conn)
    except NoSuchJobError:
        raise HTTPException(status_code=404, detail="Task not found")

    status = job.get_status()
    node_name = job.meta.get("node_name")

    if status in ['queued', 'deferred']:
        job.cancel()
        return {"message": "Job cancelled before starting."}

    elif status == 'started':
        try:
            send_stop_job_command(redis_conn, job.id)
        except Exception:
            pass # Ignore if stopping fails or is not supported
        
        # If we know the node name, enqueue a teardown just in case
        if node_name:
            teardown_job = task_queue.enqueue(task_teardown_gce, node_name)
            return {
                "message": "Kill signal sent to job. Teardown enqueued.",
                "teardown_task_id": teardown_job.id
            }
        return {"message": "Kill signal sent to job, but no node name to clean up yet."}

    elif status in ['finished', 'failed']:
        if node_name:
            teardown_job = task_queue.enqueue(task_teardown_gce, node_name)
            return {
                "message": f"Job was already {status}. Teardown enqueued.",
                "teardown_task_id": teardown_job.id
            }
        return {"message": f"Job was {status}, but no node name found to clean up."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
