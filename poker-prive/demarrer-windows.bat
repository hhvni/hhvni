@echo off
chcp 65001 >nul
title Cercle Prive - demarrage
cd /d "%~dp0"
echo.
echo  ===== Cercle Prive : demarrage automatique =====
echo.

where node >nul 2>&1 || (echo [X] Node.js n'est pas installe : https://nodejs.org/fr/download & pause & exit /b 1)
where docker >nul 2>&1 || (echo [X] Docker Desktop n'est pas installe : https://www.docker.com/products/docker-desktop/ & pause & exit /b 1)

echo [1/4] Verification de Docker Desktop...
docker info >nul 2>&1
if errorlevel 1 (
  echo     Docker Desktop n'est pas lance. Ouvre-le, attends qu'il soit pret, puis relance ce fichier.
  pause
  exit /b 1
)

echo [2/4] Demarrage de la base de donnees...
docker start poker-db >nul 2>&1 || docker run -d --name poker-db -e POSTGRES_USER=poker -e POSTGRES_PASSWORD=poker -e POSTGRES_DB=poker -p 5432:5432 postgres:16-alpine
if not exist "apps\server\.env" copy "apps\server\.env.example" "apps\server\.env" >nul

echo [3/4] Installation (quelques minutes la premiere fois)...
call npm install
if errorlevel 1 (echo [X] L'installation a echoue. & pause & exit /b 1)

echo     Preparation de la base de donnees...
set /a tries=0
:migrate
call npm run db:deploy >nul 2>&1
if not errorlevel 1 goto ok
set /a tries+=1
if %tries% geq 15 (echo [X] La base de donnees ne repond pas. & pause & exit /b 1)
timeout /t 2 >nul
goto migrate
:ok

echo [4/4] Lancement du site... le navigateur va s'ouvrir sur http://localhost:3000
echo     (Laisse cette fenetre ouverte pendant que tu joues. Pour arreter : ferme-la.)
start "" cmd /c "timeout /t 25 >nul & start http://localhost:3000"
call npm run dev
pause
