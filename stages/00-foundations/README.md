# Stage 0: Foundations

## Goal
Set up Claude Code rules and a local 3-node Kubernetes cluster.

## Why
Every later stage runs on this cluster. The Claude rules keep us from
touching the wrong cluster by mistake.

- **kind** for the local cluster: multi-node, fast to create and delete, runs in Docker.
- **3 nodes** (1 control plane, 2 workers): lets us see scheduling and node failure.
- **Ports 80/443 mapped**: ready for Ingress in Stage 5.
- **kubectl from winget**, not Docker Desktop's: Docker's copy was too old for the cluster.

## Concepts

### How Kubernetes works (restaurant view)

| Kubernetes | Restaurant | Job |
|---|---|---|
| Cluster | Whole restaurant | Everything together |
| Control plane | Manager's office | Makes decisions, cooks nothing |
| API server | Order counter | The only place orders come in |
| etcd | Order book | Records what should exist |
| Scheduler | Head waiter | Picks which kitchen cooks |
| Controller manager | Supervisor | Makes reality match the order book |
| Worker node | Kitchen | Where work happens |
| kubelet | Chef | Cooks assigned orders |
| Pod | Plate | Smallest unit served |
| Container | Food on the plate | Your app |
| Service | Table number | Stable way to reach food from any kitchen |
| Ingress | Front door | Entry for outside guests |

```
                           CUSTOMER (you)
                                  │
                                  │ ① place order (kubectl apply)
                                  ▼
╔══════════════════ MANAGER'S OFFICE (Control Plane) ══════════════════╗
║                    ┌──────────────────────────┐                      ║
║                    │   ORDER COUNTER          │  ② write order       ║
║                    │   (API Server)           │─────────────┐        ║
║                    └──▲──────────────▲────────┘             ▼        ║
║       ③ "who cooks?"  │              │ ⑥ "all good?"  ┌──────────────┐║
║            ┌──────────┴───┐   ┌──────┴────────┐       │ ORDER BOOK   │║
║            │ HEAD WAITER  │   │ SUPERVISOR    │       │ (etcd)       │║
║            │ (Scheduler)  │   │ (Controller)  │       └──────────────┘║
║            └──────────────┘   └───────────────┘                      ║
╚════════════════════════════════════▲═════════════════════════════════╝
                                     │ ④ chefs check counter for their orders
              ┌──────────────────────┴──────────────────────┐
              ▼                                             ▼
╔══════ KITCHEN 1 (Worker Node) ══════╗   ╔══════ KITCHEN 2 (Worker Node) ══════╗
║  CHEF (kubelet)                     ║   ║  CHEF (kubelet)                     ║
║        │ ⑤ cook                     ║   ║        │                            ║
║        ▼                            ║   ║        ▼                            ║
║   ┌─ PLATE (Pod) ─┐                 ║   ║   ┌─ PLATE (Pod) ─┐                 ║
║   │ food          │                 ║   ║   │ food          │                 ║
║   │ (container)   │                 ║   ║   │ (container)   │                 ║
║   └───────▲───────┘                 ║   ║   └───────▲───────┘                 ║
╚═══════════╪═════════════════════════╝   ╚═══════════╪═════════════════════════╝
            └──────────────┬───────────────────────────┘
                 ┌─────────┴──────────┐
                 │ TABLE NUMBER       │  ⑦ serve from any kitchen
                 │ (Service)          │
                 └─────────▲──────────┘
                 ┌─────────┴──────────┐
                 │ FRONT DOOR         │
                 │ (Ingress)          │
                 └─────────▲──────────┘
                     GUESTS (users)
```

1. **Order:** you send YAML to the API server.
2. **Record:** the API server saves it in etcd.
3. **Assign:** the scheduler picks a node.
4. **Pick up:** the kubelet on that node sees its order.
5. **Cook:** the kubelet starts the container in a Pod.
6. **Check:** the controller compares reality with etcd and fixes gaps.
7. **Serve:** users come in through Ingress, then the Service, then a healthy Pod.

Rule: everyone talks only to the API server, never directly to each other.

### kind vs kubectl vs docker

| Tool | Talks to | Use it for |
|---|---|---|
| kind | Docker | Create or delete the whole cluster |
| kubectl | The cluster (API server) | Everything inside the cluster: pods, deployments, services |
| docker | Your machine's Docker | Build app images; peek at node containers |

Restaurant view: kind builds or demolishes the restaurant, kubectl places orders
with the manager, docker cooks ingredients (images) at home.

| Task | Command |
|---|---|
| Create cluster | `kind create cluster` |
| Delete cluster | `kind delete cluster` |
| Build app image | `docker build` |
| Load image into cluster | `kind load docker-image` |
| Run, inspect, fix anything in the cluster | `kubectl ...` (90% of your time) |
| Stop a node (Break it exercise) | `docker stop` (learning trick only) |

In real companies kind is replaced by a cloud cluster (EKS, GKE, AKS);
kubectl and docker are used the same way.

### How kubectl finds the cluster
```
kubectl ──► reads ~/.kube/config ──► API server (inside the control-plane container)
```
The kubeconfig file holds the cluster address, credentials and current context.
kind writes it when it creates the cluster. Context `kind-orderflow` = this cluster.

### The kind config file
`kind-config.yaml` describes the cluster:
- `name: orderflow` gives context `kind-orderflow`.
- `nodes`: one control-plane, two workers. Each node is a Docker container.
- `extraPortMappings`: opens ports 80/443 on your machine into the cluster.
- `apiVersion` is the config format version. It can change in new kind releases.
  Kubernetes resources have their own versions (`v1`, `apps/v1`); check with
  `kubectl api-resources`.

## Steps
1. Install kind, then start Docker Desktop and check the engine is running:
   ```powershell
   winget install --id Kubernetes.kind --exact
   docker info
   ```
   Install kubectl too. Docker Desktop ships an older one; kubectl must be
   within 1 minor version of the cluster.
   ```powershell
   winget install --id Kubernetes.kubectl --exact
   where.exe kubectl   # the WinGet path must be listed first
   kubectl version     # client and server versions must match closely
   ```
   If the Docker path is listed first, add the WinGet kubectl folder to the
   System PATH and move it above `C:\Program Files\Docker\Docker\resources\bin`.
2. Create the cluster:
   ```powershell
   kind create cluster --config stages/00-foundations/kind-config.yaml
   ```
   Note: `failed to connect to the docker API ... dockerDesktopLinuxEngine` means
   Docker Desktop is not running. Start it, wait for "Engine running", retry.
3. Check you are on the right cluster:
   ```powershell
   kind get clusters
   kubectl config current-context   # must be kind-orderflow
   kubectl cluster-info             # API server address
   kubectl config view --minify     # server address and context in use
   ```
4. Check the nodes:
   ```powershell
   kubectl get nodes -o wide
   ```
5. Look at the system pods (the control plane parts):
   ```powershell
   kubectl get pods -n kube-system
   ```
6. See the nodes as Docker containers:
   ```powershell
   docker ps
   ```
7. Cleanup (only when you want to remove the cluster):
   ```powershell
   kind delete cluster --name orderflow
   ```

## Break it
Stop one worker node, watch it become NotReady, then start it again.
```powershell
docker stop orderflow-worker
kubectl get nodes          # wait ~40s: orderflow-worker becomes NotReady
docker start orderflow-worker
kubectl get nodes          # back to Ready
```

## What I learned
(You fill this in, in your own words.)
