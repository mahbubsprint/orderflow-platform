# Stage 0: Foundations

## Goal
Set up Claude Code rules and a local 3-node Kubernetes cluster.

## Why
Every later stage runs on this cluster. The Claude rules keep us from
touching the wrong cluster by mistake.

## How Kubernetes works (restaurant view)

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
3. Check you are on the right cluster:
   ```powershell
   kind get clusters
   kubectl config current-context   # must be kind-orderflow
   kubectl cluster-info             # API server address
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
