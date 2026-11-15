"""
TeleVault Updater Module
Permite buscar, descargar e instalar actualizaciones oficiales de TeleVault
de forma 100% segura, desatendida y protegiendo siempre las configuraciones del usuario.
"""

import sys
import os
import re
import io
import json
import shutil
import zipfile
import logging
import asyncio
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

log = logging.getLogger("televault.updater")
if not log.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

FRONTEND_DIR = Path(__file__).resolve().parent.parent

GITHUB_REPO = "DavidEsquinasSanchez/TeleVault"
GITHUB_LATEST_RELEASE_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_ARCHIVE_URL_TEMPLATE = f"https://github.com/{GITHUB_REPO}/archive/refs/tags/{{tag}}.zip"

# Archivos y carpetas protegidos que NUNCA deben sobrescribirse durante una actualización
PROTECTED_ROOT_DIRS = {
    "data",
    "logs",
    ".git",
    ".venv"
}

PROTECTED_FILENAMES = {
    ".env",
    ".env.local",
    "config.json",
    "channels.json",
    "topics_cache.json",
    ".api_token",
    ".restart_televault",
    ".tmp_update.zip"
}

_cached_update_check: Optional[Dict[str, Any]] = None
_last_check_timestamp: float = 0.0


def parse_version_tuple(v_str: str) -> Tuple[int, ...]:
    """Convierte una cadena de versión 'v3.2.1' o '3.3.0' en una tupla (3, 2, 1) para comparación segura."""
    if not v_str:
        return (0, 0, 0)
    clean = re.sub(r'^[^\d]*', '', str(v_str).strip())
    parts = re.split(r'[-+.]', clean)
    nums = []
    for p in parts:
        if p.isdigit():
            nums.append(int(p))
        else:
            break
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums[:3])


def is_protected(rel_path: str) -> bool:
    """Comprueba si una ruta relativa coincide con algún archivo o directorio protegido."""
    normalized = rel_path.replace("\\", "/").strip("/")
    parts = normalized.split("/")
    first_part = parts[0].lower()
    filename = parts[-1].lower()

    if first_part in {d.lower() for d in PROTECTED_ROOT_DIRS}:
        return True

    if filename in {f.lower() for f in PROTECTED_FILENAMES}:
        return True

    # Proteger también sesiones de Telethon (.session y .session-journal) en cualquier subcarpeta
    if filename.endswith(".session") or filename.endswith(".session-journal"):
        return True

    return False


def get_current_app_version() -> str:
    """Lee la versión actual del archivo VERSION o fallback."""
    vfile = FRONTEND_DIR / "VERSION"
    if vfile.is_file():
        try:
            val = vfile.read_text(encoding="utf-8").strip()
            if val:
                return val if val.startswith("v") else f"v{val}"
        except Exception:
            pass
    # Fallback por defecto
    return "v3.3.0"


def check_github_update(current_version: Optional[str] = None, force: bool = False) -> Dict[str, Any]:
    """
    Consulta la API de GitHub para verificar si existe una versión posterior.
    Almacena en caché los resultados durante 5 minutos para evitar límites de tasa.
    """
    global _cached_update_check, _last_check_timestamp
    import time
    now = time.time()

    curr_ver = current_version or get_current_app_version()

    if not force and _cached_update_check and (now - _last_check_timestamp < 300.0):
        # Actualizar la versión local comparada si cambió
        cached = dict(_cached_update_check)
        cached["current_version"] = curr_ver
        latest_tuple = parse_version_tuple(cached.get("latest_version", ""))
        current_tuple = parse_version_tuple(curr_ver)
        cached["update_available"] = bool(latest_tuple > current_tuple)
        return cached

    req = urllib.request.Request(
        GITHUB_LATEST_RELEASE_URL,
        headers={
            "User-Agent": "TeleVault-App",
            "Accept": "application/vnd.github.v3+json"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                tag_name = data.get("tag_name", "").strip()
                name = data.get("name") or tag_name
                body = data.get("body", "").strip()
                html_url = data.get("html_url", f"https://github.com/{GITHUB_REPO}/releases")
                published_at = data.get("published_at", "")

                direct_zip = GITHUB_ARCHIVE_URL_TEMPLATE.format(tag=tag_name)
                zipball_url = data.get("zipball_url") or direct_zip

                latest_tuple = parse_version_tuple(tag_name)
                current_tuple = parse_version_tuple(curr_ver)
                update_available = bool(latest_tuple > current_tuple)

                result = {
                    "ok": True,
                    "update_available": update_available,
                    "current_version": curr_ver,
                    "latest_version": tag_name,
                    "release_name": name,
                    "release_notes": body,
                    "published_at": published_at,
                    "html_url": html_url,
                    "download_url": direct_zip,
                    "zipball_url": zipball_url
                }
                _cached_update_check = result
                _last_check_timestamp = now
                return result
    except urllib.error.HTTPError as e:
        log.warning("Error HTTP al comprobar actualizaciones de GitHub: %s", e)
        return {
            "ok": False,
            "error": f"HTTP {e.code}: {e.reason}",
            "current_version": curr_ver,
            "update_available": False
        }
    except Exception as e:
        log.warning("Excepción al consultar actualizaciones: %s", e)
        return {
            "ok": False,
            "error": str(e),
            "current_version": curr_ver,
            "update_available": False
        }


def get_requirements_hash() -> str:
    """Devuelve un hash SHA-256 de requirements.txt si existe para detectar cambios."""
    req_txt = FRONTEND_DIR / "requirements.txt"
    if not req_txt.is_file():
        return ""
    try:
        import hashlib
        return hashlib.sha256(req_txt.read_bytes()).hexdigest()
    except Exception:
        return ""


def download_and_extract_update(
    target_tag: Optional[str] = None,
    download_url: Optional[str] = None,
    progress_callback=None
) -> Dict[str, Any]:
    """
    Descarga el paquete ZIP de la release oficial y lo instala sobre la aplicación,
    protegiendo siempre los archivos de configuración y datos del usuario.
    """
    if progress_callback:
        progress_callback("Comprobando versión en GitHub...", 5)

    if not target_tag or not download_url:
        info = check_github_update(force=True)
        if not info.get("ok"):
            raise RuntimeError(f"No se pudo consultar la release oficial: {info.get('error')}")
        target_tag = info["latest_version"]
        download_url = info.get("download_url") or GITHUB_ARCHIVE_URL_TEMPLATE.format(tag=target_tag)

    req_hash_before = get_requirements_hash()

    if progress_callback:
        progress_callback(f"Descargando versión {target_tag}...", 20)

    log.info("Descargando actualización desde %s", download_url)
    req = urllib.request.Request(
        download_url,
        headers={"User-Agent": "TeleVault-Updater"}
    )

    try:
        with urllib.request.urlopen(req, timeout=30.0) as resp:
            data = resp.read()
    except Exception as e:
        # Reintentar con zipball de la API si falló la descarga directa
        zipball = f"https://api.github.com/repos/{GITHUB_REPO}/zipball/{target_tag}"
        log.warning("Fallo al descargar desde archivo directo (%s). Reintentando con API zipball...", e)
        req_fallback = urllib.request.Request(zipball, headers={"User-Agent": "TeleVault-Updater"})
        with urllib.request.urlopen(req_fallback, timeout=40.0) as resp:
            data = resp.read()

    if not data or len(data) < 1000:
        raise RuntimeError("El archivo de actualización descargado está vacío o corrupto.")

    if progress_callback:
        progress_callback("Verificando integridad del paquete...", 50)

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except Exception as e:
        raise RuntimeError(f"El paquete descargado no es un archivo ZIP válido: {e}")

    # Determinar el directorio raíz dentro del archivo ZIP (ej: 'TeleVault-3.2.1/' o 'DavidEsquinasSanchez-TeleVault-xxxx/')
    namelist = zf.namelist()
    if not namelist:
        raise RuntimeError("El archivo ZIP de la release está vacío.")

    root_prefix = ""
    first_name = namelist[0]
    if "/" in first_name:
        root_prefix = first_name.split("/")[0] + "/"

    if progress_callback:
        progress_callback("Instalando archivos actualizados...", 70)

    updated_files_count = 0
    protected_skipped_count = 0

    for member in zf.infolist():
        fn = member.filename
        if root_prefix and fn.startswith(root_prefix):
            rel_path = fn[len(root_prefix):]
        else:
            rel_path = fn

        rel_path = rel_path.strip("/")
        if not rel_path or member.is_dir():
            continue

        if is_protected(rel_path):
            protected_skipped_count += 1
            log.debug("Omitiendo archivo protegido de la actualización: %s", rel_path)
            continue

        target_file = FRONTEND_DIR / rel_path
        target_file.parent.mkdir(parents=True, exist_ok=True)

        with zf.open(member) as src, open(target_file, "wb") as dst:
            shutil.copyfileobj(src, dst)

        updated_files_count += 1

    log.info(
        "Archivos actualizados: %d (omitidos por protección: %d)",
        updated_files_count, protected_skipped_count
    )

    # Actualizar explícitamente el archivo VERSION
    clean_tag = target_tag if str(target_tag).startswith("v") else f"v{target_tag}"
    vfile = FRONTEND_DIR / "VERSION"
    try:
        vfile.write_text(clean_tag, encoding="utf-8")
    except Exception as e:
        log.warning("No se pudo escribir archivo VERSION: %s", e)

    # Verificar si requirements.txt necesita actualización solo si cambió
    req_hash_after = get_requirements_hash()
    if req_hash_before and req_hash_after and req_hash_before != req_hash_after:
        if progress_callback:
            progress_callback("Actualizando dependencias de Python...", 90)
        run_pip_install_if_needed()
    else:
        log.info("requirements.txt no ha cambiado; omitiendo ejecución de pip.")

    if progress_callback:
        progress_callback("¡Actualización completada con éxito!", 100)

    return {
        "ok": True,
        "version": clean_tag,
        "updated_files": updated_files_count,
        "skipped_protected": protected_skipped_count,
        "message": f"TeleVault se ha actualizado correctamente a la versión {clean_tag}."
    }


def run_pip_install_if_needed() -> None:
    """Instala silenciosamente dependencias si requirements.txt existe."""
    req_txt = FRONTEND_DIR / "requirements.txt"
    if not req_txt.is_file():
        return
    py = sys.executable
    try:
        log.info("Verificando dependencias con pip...")
        subprocess.run(
            [py, "-m", "pip", "install", "-r", str(req_txt), "--quiet", "--disable-pip-version-check", "--no-warn-script-location"],
            cwd=str(FRONTEND_DIR),
            capture_output=True,
            timeout=45.0
        )
    except Exception as e:
        log.warning("No se pudo ejecutar pip install: %s", e)


def schedule_restart(delay_secs: float = 1.0) -> None:
    """
    Programa el reinicio del servidor de TeleVault para recargar el nuevo código.
    Libera el puerto y relanza la aplicación de forma segura.
    """
    async def _restart_coro():
        await asyncio.sleep(delay_secs)
        restart_flag = FRONTEND_DIR / ".restart_televault"
        try:
            restart_flag.write_text("1", encoding="utf-8")
        except Exception:
            pass

        # Si no está gestionado por iniciar.bat, relanzar directamente con subprocess
        if os.environ.get("TELEVAULT_MANAGED_BY_BAT") != "1":
            try:
                if restart_flag.is_file():
                    restart_flag.unlink()
            except Exception:
                pass
            try:
                main_py = FRONTEND_DIR / "backend" / "main.py"
                creationflags = 0
                if sys.platform == "win32":
                    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010)
                subprocess.Popen(
                    [sys.executable, str(main_py)],
                    cwd=str(FRONTEND_DIR),
                    creationflags=creationflags
                )
            except Exception as e:
                log.error("Error al relanzar proceso de TeleVault: %s", e)

        os._exit(0)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_restart_coro())
    except RuntimeError:
        # Modo síncrono / CLI
        import time
        time.sleep(delay_secs)
        os._exit(0)


def cli_main():
    """Ejecutor en línea de comandos para utilizar desde actualizar.bat."""
    print("=" * 60)
    print("  TeleVault - Comprobador de Actualizaciones Oficiales")
    print("=" * 60)
    current = get_current_app_version()
    print(f"Versión instalada actualmente: {current}")
    print("Consultando última versión publicada en GitHub...")

    info = check_github_update(current, force=True)
    if not info.get("ok"):
        print(f"\n[ERROR] No se pudo verificar la actualización: {info.get('error')}")
        return 1

    latest = info.get("latest_version")
    if not info.get("update_available"):
        print(f"\n[OK] ¡Ya tienes la versión más reciente instalada! ({latest})")
        return 0

    print(f"\n¡NUEVA VERSIÓN DISPONIBLE: {latest}!")
    print(f"Nombre de la versión: {info.get('release_name')}")
    notes = info.get("release_notes", "")
    if notes:
        print("\n--- Novedades principales ---")
        print(notes[:500] + ("..." if len(notes) > 500 else ""))
        print("----------------------------\n")

    ans = input(f"¿Deseas descargar e instalar {latest} ahora? (S/N): ").strip().lower()
    if ans not in ("s", "si", "y", "yes"):
        print("Operación cancelada por el usuario.")
        return 0

    def print_progress(msg, pct):
        print(f"[{pct}%] {msg}")

    try:
        res = download_and_extract_update(
            target_tag=latest,
            download_url=info.get("download_url"),
            progress_callback=print_progress
        )
        print(f"\n[ÉXITO] {res.get('message')}")
        print("Tus archivos de configuración (.env, config.json) y canales están a salvo.")
        return 0
    except Exception as e:
        print(f"\n[ERROR] Falló la instalación de la actualización: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(cli_main())
