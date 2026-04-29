@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "NEO4J_CONTAINER=medmemory-neo4j"
set "NEO4J_PASSWORD=medmemory123"

echo [1/6] Checking Docker...
docker --version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not installed or not running.
  exit /b 1
)

echo [2/6] Checking common port conflicts...
for %%P in (3001 5173 7687) do (
  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul
  if not errorlevel 1 (
    echo WARNING: Port %%P is already in use. Ensure it is expected.
  )
)

echo [3/6] Starting Neo4j container...
docker ps -a --filter "name=^%NEO4J_CONTAINER%$" --format "{{.Names}}" | findstr /C:"%NEO4J_CONTAINER%" >nul
if errorlevel 1 (
  docker run -d --name %NEO4J_CONTAINER% -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/%NEO4J_PASSWORD% -e NEO4J_PLUGINS=["apoc"] neo4j:5 >nul
) else (
  docker start %NEO4J_CONTAINER% >nul
)

echo [4/6] Waiting for Neo4j to be ready...
set /a RETRIES=0
:wait_neo4j
set /a RETRIES+=1
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:7474 -TimeoutSec 3; if($r.StatusCode -ge 200){ exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  if !RETRIES! GEQ 60 (
    echo ERROR: Neo4j did not become ready in time.
    exit /b 1
  )
  timeout /t 2 >nul
  goto wait_neo4j
)
echo Neo4j is ready.

echo [5/6] Starting backend API on port 3001...
start "MedMemory API" cmd /k "cd /d %ROOT%code\server && npm.cmd run dev"

echo [6/6] Starting frontend on port 5173...
start "MedMemory Client" cmd /k "cd /d %ROOT%code\client && npm.cmd run dev"

echo Done. Open http://localhost:5173
endlocal
