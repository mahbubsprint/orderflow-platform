# Stage 1: First Pod

## Goal
Run the Orders API in Kubernetes as a single Pod.

## Why
A Pod is the smallest thing Kubernetes runs. Everything later builds on it.

- **Fastify** instead of Express: faster, built-in JSON logs and request validation.
  Fits the high-throughput goal and later observability.
- **Orders in memory**: keeps this stage simple. A database comes in Stage 6.
- **Port from `PORT` env variable**: settings come from the environment, not code.

## Concepts

### The Orders API
| Endpoint | What it does |
|---|---|
| `GET /healthz` | Returns `{"status":"ok"}`. Used for health checks in Stage 4. |
| `POST /orders` | Creates an order from `{"item":"book","qty":2}`. Bad input gets a 400 error. |
| `GET /orders` | Lists all orders. |

The app listens on `0.0.0.0`, not `localhost`. Inside a container, `localhost`
means "only inside this container", so nothing outside could reach it.

### Image vs container
- **Image**: a sealed box with the app, Node and its packages. Built once, read-only.
- **Container**: a running copy of an image. Many containers can run from one image.

Restaurant view: the image is the recipe card with ingredients packed; a container
is a dish cooked from it.

```
           docker build                    docker run (x3)
Dockerfile ───────────► IMAGE orders:1.0.0 ──────────────► CONTAINER 1 (running)
                        (read-only, stored)  ├───────────► CONTAINER 2 (running)
                                             └───────────► CONTAINER 3 (stopped)
```

| | Image | Container |
|---|---|---|
| What | Packaged app: code, Node, packages | Running process started from an image |
| State | Read-only, never changes | Own writable layer (temporary files) |
| Life | Stays until you delete it | Created, runs, stops, removed |
| How many | One | Many from the same image |
| Analogy | Class / recipe | Object / cooked dish |
| Commands | `docker build`, `docker images`, `docker rmi` | `docker run`, `docker ps`, `docker logs`, `docker rm` |

- Deleting a container does not delete the image.
- Changes inside a container are lost when it is removed. Data belongs in a database (Stage 6).
- In Kubernetes, a Pod runs containers from images, like `docker run` does.

### The Dockerfile (multi-stage)
```
Stage A (deps):  node:24-alpine + package files ──► npm ci ──► node_modules
                                                                   │ copy only this
Stage B (final): node:24-alpine + node_modules + server.js ──► small image
```
| Line | Why |
|---|---|
| `node:24-alpine` | Small Linux base (~50 MB compressed vs ~400 MB for the full `node:24`) |
| Two stages | Build tools stay in stage A; only the result goes to the final image |
| Copy lock files first | Docker caches layers; code-only changes skip `npm ci` |
| `npm ci --omit=dev` | Exact versions from the lockfile, production packages only |
| `USER node` | Runs as non-root: a hacked app does not get root |
| `CMD ["node", ...]` | Node runs directly, so shutdown signals reach the app |

`.dockerignore` keeps `node_modules` and other files out of the build, like `.gitignore`.

## Steps
1. [Dev] Install dependencies and run the app on your machine:
   ```powershell
   cd app/orders
   npm install
   npm start
   ```
   | Command | What it does |
   |---|---|
   | `cd app/orders` | Go to the app folder |
   | `npm install` | Downloads packages listed in `package.json` (Fastify) into `node_modules` |
   | `npm start` | Runs the `start` script from `package.json` (`node server.js`). Expect a log line: "Server listening at http://0.0.0.0:3000" |
2. [Dev] In a second terminal, test it:
   ```powershell
   Invoke-RestMethod http://localhost:3000/healthz                 # status: ok
   Invoke-RestMethod -Method Post -Uri http://localhost:3000/orders `
     -ContentType application/json -Body '{"item":"book","qty":2}' # returns the order with an id
   Invoke-RestMethod http://localhost:3000/orders                  # lists the order
   Invoke-RestMethod -Method Post -Uri http://localhost:3000/orders `
     -ContentType application/json -Body '{"item":"book"}'         # 400 error: qty is required
   ```
   | Part | What it does |
   |---|---|
   | `Invoke-RestMethod` | PowerShell's HTTP client. Sends a request and prints the JSON reply as a table |
   | `-Method Post` | HTTP method. Default is GET |
   | `-Uri` | The address to call |
   | `-ContentType application/json` | Tells the server the body is JSON |
   | `-Body '...'` | The data sent with the request |
   | `` ` `` (backtick) | PowerShell line continuation: the command continues on the next line |

   Stop the app with Ctrl+C before step 4 (port 3000 must be free).
3. [Dev] Build the image:
   ```powershell
   cd C:\project\kubernetes\practice-project\app\orders
   docker build -t orders:1.0.0 .
   docker images orders
   ```
   | Command | What it does |
   |---|---|
   | `docker build` | Reads the `Dockerfile` and builds an image |
   | `-t orders:1.0.0` | Tag: gives the image a name (`orders`) and version (`1.0.0`). The name is a label we choose; it is not linked to the folder |
   | `.` | Build context: the folder Docker reads files from (here `app/orders`). From the project root use `app/orders` instead |
   | `docker images orders` | Lists local images named `orders`, with tag, ID and size. Shows ~260 MB: the unpacked size on disk. The compressed size (what is downloaded/pushed) is ~60 MB |

4. [Dev] Run it as a container and test:
   ```powershell
   docker run -d --name orders-test -p 3000:3000 orders:1.0.0
   Invoke-RestMethod http://localhost:3000/healthz
   docker logs orders-test
   docker exec orders-test whoami
   docker rm -f orders-test
   ```
   | Command | What it does |
   |---|---|
   | `docker run orders:1.0.0` | Starts a new container from the image |
   | `-d` | Detached: runs in the background and gives your terminal back |
   | `--name orders-test` | Names the container so later commands can refer to it |
   | `-p 3000:3000` | Port mapping `host:container`: your machine's port 3000 forwards to the container's port 3000 |
   | `Invoke-RestMethod <url>` | PowerShell's HTTP client; sends a GET request and shows the reply. Expect `status: ok` |
   | `docker logs orders-test` | Shows what the app printed (stdout/stderr): the JSON request logs |
   | `docker exec orders-test whoami` | Runs a command inside the running container. `whoami` prints the user: `node`, not `root` |
   | `docker rm -f orders-test` | Removes the container; `-f` (force) stops it first if running |

5. [Platform] Load the image into the cluster nodes.

   Each kind node is a Docker container with its own image store (containerd).
   Your image is only in Docker Desktop, so nodes cannot see it. `kind load`
   copies it into every node. Nothing runs yet; it just sits ready.

   ```
   Your machine (Docker Desktop)
   │
   ├── image: orders:1.0.0   (your build)
   │        │ kind load docker-image
   │        ▼ copies to every node
   ├── container: orderflow-control-plane
   │     └── containerd image store: orders:1.0.0
   ├── container: orderflow-worker
   │     └── containerd image store: orders:1.0.0
   └── container: orderflow-worker2
         └── containerd image store: orders:1.0.0
   ```

   Restaurant view: stocking the recipe card in every kitchen's pantry.
   Cooking starts only when an order (a Pod) arrives.

   Real world: images are pushed to a registry (Docker Hub, ECR, GHCR) and nodes
   pull from it. `kind load` is a local shortcut. Registry comes in Stage 13.

   ```powershell
   kind load docker-image orders:1.0.0 --name orderflow
   docker exec orderflow-worker crictl images | Select-String orders
   ```
   | Command | What it does |
   |---|---|
   | `kind load docker-image` | Copies an image from your Docker into every kind node |
   | `orders:1.0.0` | The image to copy |
   | `--name orderflow` | The target cluster |
   | `docker exec orderflow-worker` | Runs a command inside the worker node's container |
   | `crictl images` | Lists images in the node's container runtime (containerd) |
   | `Select-String orders` | PowerShell filter, like `grep`. Expect `docker.io/library/orders  1.0.0  ...  64.2MB` |

   Check other nodes the same way: `orderflow-worker2`, `orderflow-control-plane`.
   Node names must be exact, or Docker says `No such container`.

6. [Platform] Create the Pod.

   The manifest `manifests/pod.yaml` is the order you hand to the API server:
   "run one container from `orders:1.0.0`". Every manifest has 4 parts:
   `apiVersion` (which API), `kind` (what type), `metadata` (name, labels),
   `spec` (desired state).

   | Field | Meaning |
   |---|---|
   | `apiVersion: v1` | Pods are in the core API group, version 1 |
   | `kind: Pod` | Type of object to create |
   | `metadata.name` | The Pod's unique name in its namespace |
   | `metadata.labels` | Key-value tags. Services and Deployments find Pods by label (Stage 2) |
   | `spec.containers` | Containers in the Pod; here one |
   | `image` | Image to run, the one loaded with `kind load` |
   | `imagePullPolicy: IfNotPresent` | Use the node's copy, do not download. Needed because there is no registry yet |
   | `containerPort: 3000` | Documents the app's port. Informational; does not open anything |
   | `env` | Environment variables; sets `PORT` for the app |

   Not yet: probes and CPU/memory limits (Stage 4), namespaces (Stage 3).
   The Pod goes into the `default` namespace.

   ```powershell
   cd C:\project\kubernetes\practice-project
   kubectl config current-context
   kubectl apply -f stages/01-first-pod/manifests/pod.yaml
   kubectl get pods -o wide
   ```
   | Command | What it does |
   |---|---|
   | `kubectl config current-context` | Safety check. Must print `kind-orderflow` |
   | `kubectl apply -f <file>` | Sends the manifest to the API server: "make this exist". Expect `pod/orders created` |
   | `kubectl get pods` | Lists Pods. Expect `orders  1/1  Running` (`1/1` = 1 of 1 containers ready) |
   | `-o wide` | Extra columns: the Pod's IP and which node runs it |

7. [Platform] Explore the running Pod:
   ```powershell
   kubectl describe pod orders
   kubectl logs orders
   kubectl exec orders -- whoami
   kubectl port-forward pod/orders 3000:3000
   ```
   In a second terminal, while port-forward runs:
   ```powershell
   Invoke-RestMethod http://localhost:3000/healthz
   ```
   | Command | What it does |
   |---|---|
   | `kubectl describe pod orders` | Full details. The **Events** list at the bottom shows the story: Scheduled (node picked), Pulled (image found), Created, Started |
   | `kubectl logs orders` | What the app printed, like `docker logs` |
   | `kubectl exec orders -- whoami` | Runs a command inside the container. `--` separates kubectl's options from the command. Expect `node` |
   | `kubectl port-forward pod/orders 3000:3000` | Opens a tunnel: your `localhost:3000` goes to the Pod's port 3000. Stays running; stop with Ctrl+C. For testing only |
   | `Invoke-RestMethod .../healthz` | Calls the app through the tunnel. Expect `status: ok` |

   Reading the Events (the restaurant flow from Stage 0, for real):

   | Event | From | Restaurant step |
   |---|---|---|
   | Scheduled | `default-scheduler` | Head waiter picked a kitchen (e.g. `orderflow-worker`) |
   | Pulled | `kubelet` | Chef found the recipe in the pantry: "already present on machine" (`kind load` worked) |
   | Created | `kubelet` | Plate prepared (container created) |
   | Started | `kubelet` | Cooking (app running) |

   Each Pod gets its own IP (e.g. `10.244.1.2`), reachable only inside the cluster.

## Break it
Stop port-forward (Ctrl+C) first.

### 1. Delete the Pod
```powershell
kubectl delete pod orders
kubectl get pods
```
| Command | What it does |
|---|---|
| `kubectl delete pod orders` | Deletes the Pod |
| `kubectl get pods` | Expect `No resources found`: it stays gone |

A bare Pod has no supervisor (controller) watching it. Nobody recreates it.
Stage 2's Deployment fixes this.

### 2. Wrong image
```powershell
kubectl run bad-image --image=orders:9.9.9 --image-pull-policy=IfNotPresent
kubectl get pods -w
kubectl describe pod bad-image
kubectl delete pod bad-image
```
| Command | What it does |
|---|---|
| `kubectl run <name> --image=...` | Quick way to create a Pod without a YAML file |
| `--image-pull-policy=IfNotPresent` | Use the node's image if present, else download |
| `kubectl get pods -w` | Watch mode: prints each status change live. Stop with Ctrl+C |
| `kubectl describe pod bad-image` | Events show `Failed to pull image "orders:9.9.9" ... not found` |

What happens:
```
1. Scheduler  → assigns the Pod to a node (works)
2. kubelet    → "is orders:9.9.9 on this node?" → No
3. kubelet    → tries Docker Hub (docker.io/library/orders:9.9.9) → not found
4. Status     → ErrImagePull      (download failed)
5. Status     → ImagePullBackOff  (waiting longer before each retry, up to 5 min)
```
Real-world causes: typo in image name/tag, image never pushed, private registry
without credentials (`imagePullSecrets`). Restaurant view: the chef can't find
the recipe in the pantry or at the supplier, and keeps calling the supplier.

### 3. Crashing app
```powershell
kubectl run crash --image=orders:1.0.0 --image-pull-policy=IfNotPresent --env=PORT=abc
kubectl get pods -w
kubectl logs crash
kubectl describe pod crash
kubectl delete pod crash
```
| Command | What it does |
|---|---|
| `--env=PORT=abc` | Sets a bad port value, so the app crashes on start |
| `kubectl get pods -w` | Shows `Error` → `CrashLoopBackOff`, RESTARTS climbing |
| `kubectl logs crash` | The app's error: `code: 'ERR_SOCKET_BAD_PORT'` |
| `kubectl describe pod crash` | "Last State: Terminated, Reason: Error, Exit Code: 1" |

What happens:
```
Start → app crashes (exit 1) → Error → wait → restart → crash again ...
                                         ▲
                               CrashLoopBackOff = "waiting before next restart"
```
- RESTARTS climbs because a Pod's default `restartPolicy` is `Always`.
- Gaps grow (10s, 20s, 40s ... max 5 min) so a broken app does not burn CPU.
- It flashes `1/1 Running` because Kubernetes only knows the process started,
  not that it works. Readiness probes fix this in Stage 4.

Note: `kubectl logs crash --previous` may fail with "unable to retrieve container
logs". In a crash loop the latest dead container is the "current" one;
`--previous` asks for the one before it, which may be cleaned up. Use plain
`kubectl logs crash`.

Debug any crash loop: `get pods` (spot it) → `logs` (app error) → `describe` (exit code, events).

## What I learned
(You fill this in, in your own words.)
