# Stage 2: Deployment + Service

## Goal
Run 3 self-healing copies of the Orders API behind one stable address.

## Why
Stage 1 showed two problems:
- A deleted bare Pod stays gone. Nobody recreates it.
- Each Pod has its own IP that changes when the Pod is recreated.

A **Deployment** fixes the first (it keeps N copies running). A **Service** fixes
the second (one stable name in front of changing Pods).

## Concepts

## Steps
0. [Platform] Install a cluster viewer (optional, recommended).

   Headlamp is the official Kubernetes SIG desktop UI. It reads the same
   kubeconfig as kubectl, so it finds `kind-orderflow` by itself. Useful in this
   stage to watch Pods heal and roll out live (left menu: Map, Workloads).

   ```powershell
   winget install --id Headlamp.Headlamp --exact
   ```
   | Command | What it does |
   |---|---|
   | `winget install --id Headlamp.Headlamp --exact` | Installs Headlamp. Open it from the Start menu, click `kind-orderflow` |

   Headlamp's Overview shows **CPU 48 units** and **~46 GB memory**. That is not
   real: each kind node sees the whole PC (16 logical processors, ~15 GB given to
   Docker's WSL2 VM), and Headlamp adds the 3 nodes together.

   | Where to check | Shows |
   |---|---|
   | Task Manager → Performance → CPU | Logical processors: 16 (Kubernetes counts these, not cores) |
   | Task Manager → Performance → Memory | Total RAM (31.7 GB); Docker gets about half |
   | Headlamp → Nodes → a node | Capacity per node: 16 CPU, ~15 GB |

   **Warnings after Docker Desktop restarts (PC restart, sleep, update)**

   Headlamp may show a burst of warnings for system Pods. All 3 node containers
   restarted at once, and some parts were ready before others.

   | Warning | Why |
   |---|---|
   | `coredns` Readiness probe failed (503) | CoreDNS was not ready until the API server was up |
   | `kube-proxy` BackOff | Crashed once because the API server was not up yet; kubelet retried |
   | `local-path-provisioner` BackOff | Same reason. kind's storage helper (used in Stage 6) |

   - Nobody fixes anything: the kubelet restarts containers with back-off until
     their dependencies are up (same as Stage 1's CrashLoopBackOff).
   - RESTARTS counts grow with each Docker restart.
   - App Pods come back too: cluster state lives in etcd and survives the restart.
   - Old events disappear after about 1 hour.
   - Rule: a burst of warnings right after a restart is normal startup noise.
     Worry only if a Pod **stays** not ready or keeps restarting.

   Check it yourself:
   ```powershell
   docker ps --format "{{.Names}}  {{.Status}}"
   kubectl get pods -A
   ```
   | Command | What it does |
   |---|---|
   | `docker ps --format "{{.Names}}  {{.Status}}"` | Node containers and uptime. `Up 4 minutes` on all 3 = Docker just restarted |
   | `kubectl get pods -A` | All Pods in all namespaces (`-A`). All `Running` = recovered |

   - **1 CPU unit = 1 logical processor.** Written as `1` or `1000m` (`500m` = half).
   - **Memory** is written as `128Mi`, `1Gi`. Out of CPU = slow; out of memory = killed (OOMKilled).

1. [Dev] Show which Pod answered (app version 1.1.0).

   With 3 copies running we need to see which Pod handled each request.
   Inside a Pod, the hostname is the Pod name.

   | Change in `server.js` | Why |
   |---|---|
   | `hostname()` from `node:os` | Returns the Pod name inside Kubernetes |
   | `addHook("onSend")` | Fastify hook that runs before every response |
   | Header `x-served-by: <pod>` | Every response says which Pod served it. `x-` = custom header |
   | `/healthz` returns `pod` | Easy to see in `Invoke-RestMethod` output |

   ```powershell
   cd C:\project\kubernetes\practice-project\app\orders
   docker build -t orders:1.1.0 .
   kind load docker-image orders:1.1.0 --name orderflow
   ```
   | Command | What it does |
   |---|---|
   | `docker build -t orders:1.1.0 .` | Builds the new version. `1.0.0` stays; both exist side by side |
   | `kind load docker-image orders:1.1.0 --name orderflow` | Copies `1.1.0` to every node. Used later for the rolling update |

   Check both versions are on each node:
   ```powershell
   docker exec orderflow-control-plane crictl images | Select-String orders
   docker exec orderflow-worker crictl images | Select-String orders
   docker exec orderflow-worker2 crictl images | Select-String orders
   kubectl get node orderflow-worker -o jsonpath="{.status.images[*].names}" | Select-String orders
   ```
   | Command | What it does |
   |---|---|
   | `docker exec <node> crictl images` | Lists images in that node's containerd. Expect `orders 1.0.0` and `orders 1.1.0` |
   | `kubectl get node <node> -o jsonpath="{...}"` | Reads one field of the node object. `status.images` = images the kubelet reports |

   Every new build must be loaded again, with a new tag. Same tag = nodes keep the
   old copy (`IfNotPresent`). Real world: CI pushes to a registry, nodes pull.

2. [Platform] Create the Deployment.

   Instead of creating Pods yourself, you tell Kubernetes "keep 3 copies running,
   always". If one dies, a new one is created.

   ```
   Deployment "orders"         ← you create this: "3 replicas of this Pod template"
      │ creates & manages
      ▼
   ReplicaSet "orders-5d8f…"   ← keeps exactly 3 Pods alive (one ReplicaSet per version)
      │ creates & watches
      ▼
   Pod  Pod  Pod               ← the actual containers
   ```
   Restaurant view: a standing order, "always keep 3 plates of this dish on the
   counter". The supervisor (controller) replaces any plate that falls.

   The file `manifests/deployment.yaml`, line by line:

   ```yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: orders
     labels:
       app: orders
   spec:
     replicas: 3
     selector:
       matchLabels:
         app: orders
     template:
       metadata:
         labels:
           app: orders
       spec:
         containers:
           - name: orders
             image: orders:1.0.0
             imagePullPolicy: IfNotPresent
             ports:
               - containerPort: 3000
             env:
               - name: PORT
                 value: "3000"
   ```

   | Line | Meaning |
   |---|---|
   | `apiVersion: apps/v1` | Deployments live in the `apps` API group, version 1 (Pods are in core `v1`) |
   | `kind: Deployment` | Type of object to create |
   | `metadata.name: orders` | The Deployment's name. Pods and ReplicaSets get names starting with it |
   | `metadata.labels.app: orders` | Tag on the Deployment itself, for searching (`kubectl get deploy -l app=orders`) |
   | `spec` | Desired state of the Deployment |
   | `replicas: 3` | Desired number of Pod copies |
   | `selector.matchLabels.app: orders` | "Pods with label `app: orders` are mine". How the Deployment finds its Pods |
   | `template` | The Pod blueprint. Every copy is made from it |
   | `template.metadata.labels.app: orders` | Label put on each Pod. Must match the selector, or Kubernetes rejects the file |
   | `template.spec` | The Pod's spec, same as Stage 1's `pod.yaml` |
   | `containers` | List of containers in each Pod; here one |
   | `name: orders` | Container name inside the Pod (used by `kubectl logs -c`) |
   | `image: orders:1.0.0` | Image to run, loaded on the nodes with `kind load` |
   | `imagePullPolicy: IfNotPresent` | Use the node's copy; do not download (no registry yet) |
   | `ports.containerPort: 3000` | Documents the app's port. Informational; does not open anything |
   | `env` | Environment variables for the container |
   | `name: PORT`, `value: "3000"` | Sets `PORT=3000`. Quotes needed: env values must be text, not numbers |

   Labels appear 3 times; each has a different job:
   ```
   metadata.labels           → tag on the Deployment (for you to search)
   selector.matchLabels      → which Pods the Deployment owns
   template.metadata.labels  → tag stamped on every new Pod (must match the selector)
   ```

   Starts with `orders:1.0.0` so we can update to `1.1.0` later and watch it.

   ```powershell
   cd C:\project\kubernetes\practice-project
   kubectl config current-context
   kubectl apply -f stages/02-deployment-service/manifests/deployment.yaml
   kubectl get deployment orders
   kubectl get replicaset
   kubectl get pods -o wide
   ```
   | Command | What it does |
   |---|---|
   | `kubectl config current-context` | Safety check. Must print `kind-orderflow` |
   | `kubectl apply -f <file>` | Sends the Deployment to the API server. Expect `deployment.apps/orders created` |
   | `kubectl get deployment orders` | Expect `READY 3/3`, `UP-TO-DATE 3`, `AVAILABLE 3` |
   | `kubectl get replicaset` | The ReplicaSet the Deployment made, e.g. `orders-5d8f…  DESIRED 3  CURRENT 3  READY 3` |
   | `kubectl get pods -o wide` | 3 Pods named `orders-<replicaset-id>-<random>`, spread across workers |

   Reading the Pod name `orders-dcdf899dd-2p98h`:
   ```
   orders-dcdf899dd-2p98h
   └name┘ └ReplicaSet┘ └random┘
   ```
   - `dcdf899dd` is a hash of the Pod template. A new version gets a new ReplicaSet ID.
   - Pods may not spread evenly (e.g. 2 on `worker`, 1 on `worker2`). Even spread
     needs topology spread rules (Stage 9).
   - No Pods on `control-plane`: kind marks it "no app workloads" with a **taint**.

   **Why app Pods never land on the control-plane node**

   The control plane is the cluster's brain (API server, etcd, scheduler). If
   app Pods used up its CPU or memory, the whole cluster could fail. So it
   carries a "keep out" sign, a **taint**.

   ```powershell
   kubectl describe node orderflow-control-plane | Select-String Taints
   ```
   | Command | What it does |
   |---|---|
   | `kubectl describe node <name> \| Select-String Taints` | Shows the node's taints. Expect `node-role.kubernetes.io/control-plane:NoSchedule` |

   | Part | Meaning |
   |---|---|
   | `node-role.kubernetes.io/control-plane` | Taint key: "this is a control-plane node" |
   | `NoSchedule` | Scheduler places no new Pods here unless they tolerate the taint |

   - **Taint** (on a node) = "keep out". **Toleration** (on a Pod) = "I'm allowed in".
   - System Pods (etcd, kube-proxy) have tolerations, so they run there. `orders`
     Pods do not, so they go to workers only.
   - Restaurant view: the manager's office has a "staff only" sign; chefs cook in
     the kitchens.
   - Real world: cloud clusters (EKS, GKE, AKS) hide the control plane; you never
     see it as a node.

3. [Platform] Self-healing and scaling.

   The Deployment keeps comparing "desired" (3) with "actual". Delete a Pod and
   actual drops to 2, so the ReplicaSet creates a new one. This fixes Stage 1's
   "deleted Pod stays gone" problem.

   ```powershell
   kubectl get pods
   kubectl delete pod <one-pod-name>
   kubectl get pods
   kubectl scale deployment orders --replicas=5
   kubectl get pods -o wide
   kubectl scale deployment orders --replicas=3
   kubectl get pods
   ```
   | Command | What it does |
   |---|---|
   | `kubectl get pods` (1st) | Lists the 3 Pods. Copy one name for the next command |
   | `kubectl delete pod <name>` | Deletes that one Pod. Expect `pod "orders-…" deleted` |
   | `kubectl get pods` (2nd) | Still 3 Pods: one is new, with a young `AGE` and a new random suffix |
   | `kubectl scale deployment orders` | Changes the desired number of copies of the Deployment `orders` |
   | `--replicas=5` | New desired count. Expect `deployment.apps/orders scaled` |
   | `kubectl get pods -o wide` | 5 Pods; `-o wide` adds the NODE column to see where the 2 new ones landed |
   | `kubectl scale deployment orders --replicas=3` | Desired count back to 3. Expect `deployment.apps/orders scaled` |
   | `kubectl get pods` (3rd) | Back to 3 Pods. 2 were removed (briefly shown as `Terminating`) |

   What happens when you delete 1 of 3 Pods (self-healing, takes a few seconds):
   ```
   1. You delete Pod A          → API server marks it for deletion
   2. ReplicaSet controller     → counts Pods with label app=orders: 2, desired: 3
   3. It creates a new Pod D    → from the template (same image, same settings)
   4. Scheduler                 → picks a node for D (may be a different node)
   5. kubelet                   → starts D → back to 3/3
   ```
   - The new Pod has a **new name**. It is a brand-new Pod, not the old one
     restarted. The ReplicaSet part (`dcdf899dd`) stays; the random suffix changes.
   - You may briefly see 4 Pods: the old one shows `Terminating` (graceful
     shutdown, up to 30s) while the new one already starts.
   - Same for any cause: crash, node failure, delete. The controller only cares
     about the count.
   - Exception: delete the **Deployment** itself and all its Pods go too. No
     desired state is left to keep.

   See which version each Pod runs (the image tag is the version):
   ```powershell
   kubectl get pods -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image
   kubectl describe pod <pod-name> | Select-String Image
   ```
   | Command | What it does |
   |---|---|
   | `-o custom-columns=NAME:...,IMAGE:...` | Prints only the columns you choose. Left of `:` = header, right = field path |
   | `.spec.containers[0].image` | Field path: the first container's image, e.g. `orders:1.0.0` |
   | `describe pod <name> \| Select-String Image` | Full Pod details filtered to the image lines |

   In Headlamp: Workloads → Pods → click a Pod → Containers → Image.

   `kubectl scale` changes the live cluster only. The YAML file still says 3, so
   the next `kubectl apply` resets it to 3. Real teams change the YAML (Git is the
   source of truth); `scale` is for quick tests.

4. [Platform] Rolling update and rollback.

   We upgrade the app while it keeps running, then practice going back.

   | # | Action | Real-life meaning |
   |---|---|---|
   | 1 | Upgrade 1.0.0 → 1.1.0 | Releasing a new version |
   | 2 | Roll back to 1.0.0 | New version has a bug: return to the old one fast |
   | 3 | Upgrade again to 1.1.0 | Bug fixed: release again |

   Both images (`1.0.0` from Stage 1, `1.1.0` from step 1) are already on every
   node, so the upgrade is a one-line change in `deployment.yaml`:
   `image: orders:1.0.0` → `image: orders:1.1.0`.

   Kubernetes swaps Pods **one at a time**, so users never see the app down:
   ```
   Before:  [1.0] [1.0] [1.0]
            [1.0] [1.0] [1.0] [1.1]   ← new one starts first
            [1.0] [1.0] [1.1]         ← then one old one stops
            [1.0] [1.1] [1.1]
   After:   [1.1] [1.1] [1.1]
   ```
   Restaurant view: replacing chefs one by one with chefs who know the new
   recipe. The restaurant never closes.

   Under the hood:
   ```
   Start:   ReplicaSet v1 (1.0.0): ●●●      ReplicaSet v2 (1.1.0): -
   Step 1:  v1: ●●●   v2: ○             (start 1 new, wait until Running)
   Step 2:  v1: ●●    v2: ●             (remove 1 old)
   ...      repeat
   End:     v1: (0 Pods, kept for rollback)   v2: ●●●
   ```
   - One ReplicaSet per version. The old one is scaled to 0 but **kept**, which
     makes rollback instant.
   - Default rules: `maxSurge` 25% (max extra Pods during update) and
     `maxUnavailable` 25% (max missing Pods). With 3 replicas that is 1 extra,
     0 missing (rounded), so capacity never drops.
   - Rollback (`rollout undo`) scales the old ReplicaSet back up and the new one down.

   **Setup: 2 terminals.**
   - Terminal 2 (watch): `kubectl get replicaset -w` — shows each version group change live.
     (`-w` = watch; stop with Ctrl+C.) Or use Headlamp: Workloads → Pods.
   - Terminal 1 (action): run the commands below.

   **Part 0: Start from the old version (1.0.0)**

   Edit `deployment.yaml`: set `image: orders:1.0.0`, save.
   ```powershell
   kubectl apply -f stages/02-deployment-service/manifests/deployment.yaml
   kubectl get pods -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image
   ```
   | Command | What it does |
   |---|---|
   | `kubectl apply -f deployment.yaml` | Sends the YAML. Pods switch to 1.0.0. Expect `deployment.apps/orders configured` |
   | `kubectl get pods -o custom-columns=...` | Shows each Pod's image. Expect all 3 on `orders:1.0.0` |

   **Part 1: Release the new version (1.1.0)**

   Edit `deployment.yaml`: set `image: orders:1.1.0`, save.
   ```powershell
   kubectl apply -f stages/02-deployment-service/manifests/deployment.yaml
   kubectl rollout status deployment orders
   kubectl get pods -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image
   ```
   | Command | What it does |
   |---|---|
   | `kubectl apply -f deployment.yaml` | Sends the new image. Kubernetes starts swapping Pods one by one |
   | `kubectl rollout status deployment orders` | Waits and reports until the swap finishes: `successfully rolled out` |
   | `kubectl get pods -o custom-columns=...` | Confirms all 3 Pods now run `orders:1.1.0` |

   **Part 2: Label the release and view history**
   ```powershell
   kubectl annotate deployment orders kubernetes.io/change-cause="update to 1.1.0" --overwrite
   kubectl rollout history deployment orders
   ```
   | Command | What it does |
   |---|---|
   | `kubectl annotate deployment orders` | Adds a note to the Deployment, like a commit message |
   | `kubernetes.io/change-cause="..."` | The special note key shown in the CHANGE-CAUSE column of history |
   | `--overwrite` | Replace the note if one exists already |
   | `kubectl rollout history deployment orders` | Lists releases (revisions), newest last, with their notes |

   **Part 3: Pretend 1.1.0 has a bug: roll back**
   ```powershell
   kubectl rollout undo deployment orders
   kubectl get replicaset
   kubectl get pods -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image
   ```
   | Command | What it does |
   |---|---|
   | `kubectl rollout undo deployment orders` | Goes back to the previous release (1.0.0). Shows a warning (explained below) |
   | `kubectl get replicaset` | The 1.0.0 group (`dcdf899dd`) is back to 3, the 1.1.0 group at 0 |
   | `kubectl get pods -o custom-columns=...` | Confirms all 3 Pods run `orders:1.0.0` again |

   **Part 4: Bug fixed: release again from the YAML**
   ```powershell
   kubectl apply -f stages/02-deployment-service/manifests/deployment.yaml
   kubectl get pods -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image
   ```
   | Command | What it does |
   |---|---|
   | `kubectl apply -f deployment.yaml` | YAML still says 1.1.0, so Pods move back to 1.1.0. Undo only changed the live cluster; the YAML (Git) is the truth |
   | `kubectl get pods -o custom-columns=...` | Confirms all 3 Pods run `orders:1.1.0` |

   **Reading the watch output (terminal 2)**

   | Column | Meaning |
   |---|---|
   | DESIRED | How many Pods this group (version) wants |
   | CURRENT | How many Pods exist |
   | READY | How many are running and OK |

   Real output from switching 1.1.0 (`7dbfbf88d9`) to 1.0.0 (`dcdf899dd`), simplified:
   ```
             new(1.0.0)    old(1.1.0)    total ready
   Start        0              3             3
   Step 1       1 ← starts     3             4   (1 extra = maxSurge)
   Step 2       1              2 ← stops     3
   Step 3       2 ← starts     2             4
   Step 4       2              1 ← stops     3
   Step 5       3 ← starts     1             4
   End          3              0 ← stops     3
   ```
   - Total ready **never drops below 3**. A new Pod must be READY before an old
     one stops. That is why there is no downtime.
   - In each step DESIRED changes first (the wish), then CURRENT (Pod created),
     then READY (Pod running).

   What you will notice:

   **ReplicaSets are reused.** Still only 2 (`dcdf899dd` = 1.0.0, `7dbfbf88d9` = 1.1.0).
   The ID is a hash of the Pod template, so the same version always gets the same
   ReplicaSet. Kubernetes just scales one up and the other down.

   **Revision numbers move.** Going back to an old version moves that revision to
   the top with a new number:
   ```
   Before undo:  1 (1.0.0)   2 (1.1.0)
   After undo:   2 (1.1.0)   3 (1.0.0)   ← old revision 1 reused, new number
   After apply:  3 (1.0.0)   4 (1.1.0)
   ```

   **Warning on `rollout undo`:** "Rolling back will not update the
   kubectl.kubernetes.io/last-applied-configuration annotation…"
   - `kubectl apply` remembers the last YAML you sent, in the annotation
     `last-applied-configuration`.
   - `undo` changes the live cluster without updating that memory, so the next
     `apply` may compare against stale data.
   - Real world: roll back by reverting the YAML in Git and running `apply` (or
     GitOps, Stage 13). `undo` is the emergency button.
   - Running `apply` again (last command) clears the mismatch.

5. [Platform] Create the Service.

   Each Pod has its own IP, and it changes every time a Pod is replaced (step 4
   replaced all Pods several times). Other apps cannot track that. A **Service**
   gives the Pods one stable name and IP, and spreads requests across them.

   ```
                       Service "orders"  (stable IP, DNS name: orders)
     client ──► http://orders ──┐
                                │  kube-proxy picks one Pod
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
            Pod 10.244.1.7  Pod 10.244.2.5  Pod 10.244.2.6   (IPs change, name doesn't)
   ```
   Restaurant view: the **table number**. Guests order at table 5 and do not
   care which kitchen cooks.

   The file `manifests/service.yaml`, line by line:
   ```yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: orders
     labels:
       app: orders
   spec:
     type: ClusterIP
     selector:
       app: orders
     ports:
       - name: http
         port: 80
         targetPort: 3000
         protocol: TCP
   ```
   | Line | Meaning |
   |---|---|
   | `apiVersion: v1` | Services are in the core API group, like Pods |
   | `kind: Service` | Type of object |
   | `metadata.name: orders` | Service name. Also **becomes the DNS name** `orders` |
   | `metadata.labels.app: orders` | Tag on the Service itself, for searching |
   | `type: ClusterIP` | Reachable only inside the cluster. Outside access comes in Stage 5 (Ingress) |
   | `selector.app: orders` | Send traffic to Pods with this label: the one the Deployment stamps on its Pods |
   | `ports.name: http` | A name for the port; other tools can refer to it |
   | `port: 80` | Port clients call, so `http://orders` works without a port number |
   | `targetPort: 3000` | Port the app listens on inside the Pod |
   | `protocol: TCP` | Network protocol (TCP is the default) |

   ```
   client → orders:80  ──Service──►  Pod:3000
            (port)                    (targetPort)
   ```
   The Service finds Pods through a live list of matching Pod IPs called
   **EndpointSlices**. When a Pod is replaced, the list updates by itself.

   **Part 1: Create the Service and look at it**
   ```powershell
   kubectl apply -f stages/02-deployment-service/manifests/service.yaml
   kubectl get service orders
   kubectl describe service orders
   kubectl get endpointslices -l kubernetes.io/service-name=orders
   kubectl get pods -o wide
   ```
   | Command | What it does |
   |---|---|
   | `kubectl apply -f service.yaml` | Creates the Service. Expect `service/orders created` |
   | `kubectl get service orders` | Shows `TYPE ClusterIP`, a `CLUSTER-IP` like `10.96.x.x` (stable), `PORT(S) 80/TCP` |
   | `kubectl describe service orders` | Full details. `Endpoints:` lists the 3 Pod IPs with port 3000 |
   | `kubectl get endpointslices -l kubernetes.io/service-name=orders` | The live list of Pod IPs behind the Service. `-l` = filter by label |
   | `kubectl get pods -o wide` | Compare: the Pod IPs here match the endpoints |

   Real result:
   ```
   Service orders  10.96.216.162:80   (fixed)
      ├──► 10.244.2.14:3000   pod 5jj5d   worker2
      ├──► 10.244.1.17:3000   pod q7fxs   worker
      └──► 10.244.2.15:3000   pod vzcx5   worker2
   ```
   | Item | Meaning |
   |---|---|
   | `10.96.x.x` | Service IP range. Stays the same as long as the Service exists |
   | `10.244.x.x` | Pod IP range. Changes when Pods are replaced |
   | `10.244.1.x` / `10.244.2.x` | Third number = node: each node gets its own Pod IP block |
   | `Selector: app=orders` | How the Service found the Pods: by label |
   | `Session Affinity: None` | Each request may go to a different Pod; no "sticking" |

   **Part 2: Call the Service from your machine**
   ```powershell
   kubectl port-forward service/orders 8080:80
   ```
   In a 2nd terminal:
   ```powershell
   Invoke-RestMethod http://localhost:8080/healthz
   Invoke-RestMethod http://localhost:8080/healthz
   ```
   | Command | What it does |
   |---|---|
   | `kubectl port-forward service/orders 8080:80` | Tunnel: your `localhost:8080` → Service port 80. Stop with Ctrl+C |
   | `Invoke-RestMethod http://localhost:8080/healthz` | Calls the app. Expect `status: ok` and a `pod` name |

   Note: port-forward picks **one** Pod and sticks to it, so `pod` is the same
   every time. It is a debugging tunnel, not load balancing. Step 6 shows real
   load balancing from inside the cluster.

6. [Platform] DNS and load balancing from inside the cluster.

   This is how other apps (Payment in Stage 7) will call Orders: by **name**,
   from **inside** the cluster. We start a temporary Pod, open a shell in it,
   and call `http://orders`.

   ```
   temp Pod ──► "orders"? ──► CoreDNS: "orders = 10.96.216.162"
            ──► 10.96.216.162:80 ──► kube-proxy picks a Pod ──► Pod A / B / C
   ```
   - **CoreDNS** = the cluster's phone book (runs in `kube-system`).
   - Full name: `orders.default.svc.cluster.local` = service `orders`, namespace
     `default`. Inside the same namespace, `orders` alone is enough.

   Terminal: start a temporary Pod with a shell inside.
   ```powershell
   kubectl run tmp --rm -it --image=orders:1.1.0 --image-pull-policy=IfNotPresent --restart=Never -- sh
   ```
   | Part | What it does |
   |---|---|
   | `kubectl run tmp` | Creates a Pod named `tmp` |
   | `--rm` | Deletes the Pod automatically when you exit |
   | `-it` | Interactive terminal: you can type inside |
   | `--image=orders:1.1.0` | Reuses our image (has `wget`, `nslookup`); no download |
   | `--image-pull-policy=IfNotPresent` | Use the node's copy |
   | `--restart=Never` | One-off Pod, not restarted |
   | `-- sh` | Command to run inside: a shell. Prompt becomes `/app $` |

   Inside the shell:
   ```sh
   nslookup orders
   wget -qO- http://orders/healthz; echo
   for i in 1 2 3 4 5 6; do wget -qO- http://orders/healthz; echo; done
   wget -qO- http://orders.default.svc.cluster.local/healthz; echo
   exit
   ```
   | Command | What it does |
   |---|---|
   | `nslookup orders` | Asks DNS for `orders`. Expect `Address: 10.96.216.162` |
   | `wget -qO- <url>` | Fetches a URL and prints it. `-q` = quiet, `-O-` = print to screen |
   | `; echo` | Adds a new line after each reply |
   | `for i in 1 ... 6; do ...; done` | Repeats the call 6 times. The `pod` name changes: load balancing |
   | `wget ... orders.default.svc.cluster.local ...` | Full DNS name; same result |
   | `exit` | Leaves the shell; the Pod is deleted (`--rm`) |

   Real output, explained:

   **`nslookup` shows `NXDOMAIN` lines: not errors.** Each Pod has a search list
   of domain endings. A short name is tried with each one:
   ```
   orders.default.svc.cluster.local  ✔ found → 10.96.216.162
   orders.svc.cluster.local          ✘ NXDOMAIN (no such name)
   orders.cluster.local              ✘ NXDOMAIN
   ```
   `nslookup` prints every attempt. One success is all that matters.
   `Server: 10.96.0.10` is CoreDNS's own Service IP.

   **Load balancing:**
   ```
   vzcx5, 5jj5d, vzcx5, vzcx5, 5jj5d, 5jj5d   (q7fxs answered other calls)
   ```
   Random, not strict round-robin: kube-proxy picks a Pod by chance for each new
   connection. Over many requests it evens out.

   **"All commands ... will be recorded in container logs"**: anything typed in an
   interactive Pod ends up in its logs. Never type passwords there.

## Break it

### 1. Delete a Pod
Done in step 3: the Deployment recreates it within seconds (self-healing).

### 2. Release a broken version
A bad release happens in real life. Kubernetes protects you: old Pods keep
serving while the broken one fails.

**How the old Pods protect you: two rules**

Rule 1: the update waits for "Ready". With 3 replicas the budget is 1 extra Pod
(`maxSurge`) and 0 missing (`maxUnavailable`).
```
Kubernetes:  "Start 1 new Pod (9.9.9)."            → [1.1] [1.1] [1.1] [9.9 ✘]
             "Is it Ready? No (can't pull image)."
             "May I stop an old Pod? Only if a new one is Ready."
             "No new Pod is Ready → stop nothing. Wait."
Result:      [1.1] [1.1] [1.1] keep running. Rollout is stuck, not broken.
```
Rule 2: the Service only sends traffic to Ready Pods. The broken Pod is never
in the endpoint list, so users never reach it.
```
Service orders ──► [1.1] [1.1] [1.1]      (broken 9.9 Pod not in the list)
```
Restaurant view: a new chef must prove they can cook (Ready) before an old chef
leaves. If the new chef never shows up, the old chefs keep working.

Limit: this only catches problems that stop a Pod from becoming Ready (missing
image, crash at start). If the new version runs but has a bug (wrong prices),
Kubernetes cannot tell. Readiness probes (Stage 4) let the app report "not ready".

Keep `kubectl get pods -w` running in a 2nd terminal.
```powershell
kubectl set image deployment/orders orders=orders:9.9.9
kubectl rollout status deployment orders --timeout=60s
kubectl get pods
kubectl get replicaset
kubectl apply -f stages/02-deployment-service/manifests/deployment.yaml
kubectl rollout status deployment orders
```
| Command | What it does |
|---|---|
| `kubectl set image deployment/orders` | Changes the Deployment's image directly, without editing YAML |
| `orders=orders:9.9.9` | Container `orders` gets image `orders:9.9.9`, which does not exist |
| `kubectl rollout status ... --timeout=60s` | Waits up to 60s, then gives up: `timed out waiting` |
| `kubectl get pods` | 3 old Pods `Running` + 1 new Pod `ImagePullBackOff` |
| `kubectl get replicaset` | A 3rd ReplicaSet for 9.9.9 with `DESIRED 1, READY 0` |
| `kubectl apply -f deployment.yaml` | The fix: send the good YAML (1.1.0) again. Broken Pod is removed |
| `kubectl rollout status deployment orders` | Confirms `successfully rolled out` |

Real result:
- The **same 3 Pods** (`5jj5d`, `q7fxs`, `vzcx5`) ran the whole time. None were
  replaced: proof the old Pods were protected.
- The broken version got its own ReplicaSet (`5d58456c56`). After the fix it is
  at 0, kept in history like the others.

### 3. Wrong Service label
A label typo is one of the most common real bugs. Pods are healthy, the Service
exists, but no traffic gets through.
```
Service selector: app=order   (typo, missing "s")
Pods' label:      app=orders
→ no Pod matches → endpoint list empty → every request fails
```
Restaurant view: the phone number now rings a kitchen that does not exist.

```powershell
kubectl set selector service orders app=order
kubectl describe service orders | Select-String "Selector|Endpoints"
kubectl get endpointslices -l kubernetes.io/service-name=orders
kubectl run tmp --rm -it --image=orders:1.1.0 --image-pull-policy=IfNotPresent --restart=Never -- wget -qO- -T 3 http://orders/healthz
kubectl get pods
kubectl apply -f stages/02-deployment-service/manifests/service.yaml
kubectl get endpointslices -l kubernetes.io/service-name=orders
```
| Command | What it does |
|---|---|
| `kubectl set selector service orders app=order` | Changes the Service selector to the typo `app=order` |
| `kubectl describe service orders \| Select-String "Selector\|Endpoints"` | Shows only those 2 lines. Expect `Selector: app=order` and empty `Endpoints:` |
| `kubectl get endpointslices -l ...` (1st) | The live Pod list is empty: `ENDPOINTS <unset>` |
| `kubectl run tmp ... -- wget -qO- -T 3 http://orders/healthz` | One-off Pod calls the Service once. `-T 3` = give up after 3s. Expect an error (e.g. `Connection refused`) |
| `kubectl get pods` | All 3 Pods still `Running`. The app is fine; only the wiring is broken |
| `kubectl apply -f service.yaml` | The fix: correct selector from the YAML |
| `kubectl get endpointslices -l ...` (2nd) | The 3 Pod IPs are back |

Real result: `Selector: app=order`, `Endpoints:` empty, EndpointSlice
`<unset>`, and `wget: can't connect to remote host (10.96.216.162): Connection refused`.
Pods stayed `Running`. After `apply`, the 3 Pod IPs came back.

- DNS still worked (`orders` → `10.96.216.162`): the Service exists.
- `Connection refused` came **instantly**, not after the 3s timeout. kube-proxy
  actively rejects traffic to a Service with no endpoints.

Debug tip: Service exists but requests fail → check its **Endpoints** first.
Empty endpoints = the selector does not match the Pod labels. A fast
`Connection refused` to a Service IP points to the same thing.

### 4. Orders disappear between Pods
Why apps must be **stateless** when they run as many copies.
```
POST /orders  ──Service──► Pod A   (order saved in Pod A's memory only)
GET  /orders  ──Service──► Pod B   → []        (Pod B never saw it)
GET  /orders  ──Service──► Pod A   → [order]
GET  /orders  ──Service──► Pod C   → []
```
Each Pod has its own memory, and the Service sends each request to a random
Pod. Same question, different answers. Restaurant view: each kitchen keeps its
own order book. Fix (Stage 6): a shared database.

Start a temporary Pod with a shell:
```powershell
kubectl run tmp --rm -it --image=orders:1.1.0 --image-pull-policy=IfNotPresent --restart=Never -- sh
```
Inside the shell:
```sh
wget -qO- --header 'Content-Type: application/json' --post-data '{"item":"book","qty":2}' http://orders/orders; echo
for i in 1 2 3 4 5 6; do wget -qO- http://orders/orders; echo; done
exit
```
| Command | What it does |
|---|---|
| `wget ... --post-data '{...}' http://orders/orders` | Creates an order (POST). Reply shows the new order |
| `--header 'Content-Type: application/json'` | Tells the app the data is JSON |
| `--post-data '...'` | Data to send. Makes `wget` send a POST instead of GET |
| `for i in 1 ... 6; do wget -qO- http://orders/orders; echo; done` | Lists orders 6 times. Expect a mix of `[{...book...}]` and `[]` |
| `exit` | Leaves the shell; the temporary Pod is deleted |

Real result: the order was created once, then listed 6 times:
```
[{"id":"3ce93c11-...","item":"book","qty":2,...}]   ← the Pod that saved it
[{"id":"3ce93c11-...","item":"book","qty":2,...}]
[]                                                  ← another Pod
[{"id":"3ce93c11-...","item":"book","qty":2,...}]
[]
[]
```
Same question, two answers. A real customer would see their order appear and
disappear on refresh. Note: a Docker Desktop restart also wipes all orders,
since memory does not survive a container restart.

**So will the database always be one?**
Logically one (all Pods see the same data); physically it can be many copies.

| Setup | How it works | Use |
|---|---|---|
| Single | 1 database Pod; all app Pods use it | Learning, small apps. Stage 6 starts here |
| Primary + replicas | 1 primary takes writes and copies data to replicas; replicas serve reads | Most real apps: faster reads, failover if the primary dies |
| Sharding | Data split by key (e.g. customers A-M on DB 1, N-Z on DB 2) | Very large scale |
| Managed DB | Cloud runs it (AWS RDS, Cloud SQL) | Common in production; many teams keep databases outside Kubernetes |

```
App Pods (many, stateless)        Database (stateful)
  [orders] [orders] [orders]  ──writes──► Primary ──copies──► Replica, Replica
                              ──reads───► Primary or Replicas
```
- App Pods: stateless, many, easy to kill and replace (Deployments).
- Database: stateful, needs stable storage and careful handling (StatefulSet, Stage 6).
- Later, optional: primary + replica with a Postgres operator (e.g. CloudNativePG).

## What I learned
(You fill this in, in your own words.)
