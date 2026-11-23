"""
TeleVault - Auditor y Sincronizador de Carpetas Locales.
Compara vídeos descargados en local (eMule, Torrent, descargas directas)
con el catálogo existente en los canales y temas de Telegram.
"""
import os
import re
import math
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# Extensiones de vídeo soportadas por TeleVault
VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".avi", ".mov", ".webm",
    ".m4v", ".wmv", ".flv", ".ts", ".mpg", ".mpeg"
}

# Extensiones temporales o descartables de clientes P2P
IGNORE_EXTENSIONS = {
    ".part", ".met", ".tmp", ".crdownload", ".part.met", ".bak",
    ".nfo", ".txt", ".srt", ".sub", ".jpg", ".png", ".torrent"
}

# Tags comunes de ripeos, códecs y resoluciones para limpiar títulos
RELEASE_TAGS_REGEX = re.compile(
    r"\b(1080p|720p|480p|2160p|4k|uhd|bluray|bdrip|brrip|dvdrip|hdtv|web-?dl|webrip|"
    r"x264|x265|hevc|h264|xvid|divx|ac3|dts|aac|mp3|eac3|atmos|truehd|"
    r"spanish|castellano|dual|latino|subtitulado|subs|multi|remux|h264|"
    r"proper|repack|internal|extended|unrated|director'?s\.?cut)\b",
    re.IGNORECASE
)


def normalize_for_comparison(text: str) -> str:
    """Normaliza texto eliminando tildes, signos de puntuación y espacios extras."""
    if not text:
        return ""
    # Quitar acentos
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    # Cambiar separadores por espacios
    text = re.sub(r"[\._\-\–\—\(\)\[\]\{\}\/\\,;:+]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_title(title: str) -> str:
    """Limpia tags de release, corchetes y caracteres extraños de un título."""
    if not title:
        return ""
    # Quitar corchetes, paréntesis y su contenido si contiene tags comunes
    title = re.sub(r"\[.*?\]", " ", title)
    title = re.sub(r"\(.*?\b(1080p|720p|bluray|dvdrip|xvid|x264|x265|spanish|hdtv)\b.*?\)", " ", title, flags=re.I)
    # Reemplazar puntos y guiones bajos por espacios
    title = re.sub(r"[\._]", " ", title)
    # Quitar tags de release
    title = RELEASE_TAGS_REGEX.sub(" ", title)
    # Quitar año entre paréntesis o suelto al final si procede
    title = re.sub(r"\b(19\d{2}|20\d{2})\b", " ", title)
    title = re.sub(r"\s+", " ", title).strip(" -_.,")
    return title


def is_series_title_match(series_a: str, series_b: str) -> bool:
    """
    Comprueba si dos títulos corresponden a la misma serie tolerando diferencias ortográficas,
    erratas menores (ej: Percy Jackson vs Percy Jacson) y sufijos de temporada.
    """
    norm_a = normalize_for_comparison(series_a)
    norm_b = normalize_for_comparison(series_b)
    if not norm_a or not norm_b:
        return False
    if norm_a == norm_b:
        return True

    # Quitar sufijos de temporada de ambos lados si están presentes
    clean_a = re.sub(r"\b(?:temporada|season|temp\.?|t)\s*\d+.*", "", norm_a, flags=re.I).strip()
    clean_b = re.sub(r"\b(?:temporada|season|temp\.?|t)\s*\d+.*", "", norm_b, flags=re.I).strip()

    if clean_a and clean_b:
        if clean_a == clean_b:
            return True
        if len(clean_a) >= 4 and len(clean_b) >= 4:
            if clean_a in clean_b or clean_b in clean_a:
                return True
        # Comparación difusa (SequenceMatcher) para tolerar erratas
        ratio = SequenceMatcher(None, clean_a, clean_b).ratio()
        if ratio >= 0.78:
            return True
        # Comparación por conjunto de palabras significativas
        stop_words = {"los", "las", "del", "por", "para", "con", "una", "uno", "the", "and"}
        words_a = set(w for w in clean_a.split() if len(w) >= 3 and w not in stop_words)
        words_b = set(w for w in clean_b.split() if len(w) >= 3 and w not in stop_words)
        if words_a and words_b:
            overlap = len(words_a & words_b)
            if overlap >= max(len(words_a), len(words_b)) * 0.65:
                return True

    if len(norm_a) >= 4 and len(norm_b) >= 4:
        if norm_a in norm_b or norm_b in norm_a:
            return True
        if SequenceMatcher(None, norm_a, norm_b).ratio() >= 0.78:
            return True

    return False


def is_movie_title_match(movie_a: str, movie_b: str) -> bool:
    """Comprueba si dos títulos corresponden a la misma película."""
    norm_a = normalize_for_comparison(movie_a)
    norm_b = normalize_for_comparison(movie_b)
    if not norm_a or not norm_b:
        return False
    if norm_a == norm_b:
        return True
    if len(norm_a) >= 4 and len(norm_b) >= 4:
        if norm_a in norm_b or norm_b in norm_a:
            return True
        if SequenceMatcher(None, norm_a, norm_b).ratio() >= 0.82:
            return True
    return False


def parse_media_filename(filename: str, parent_folder: str = "") -> Dict[str, Any]:
    """
    Analiza el nombre de un archivo local para detectar si es una serie o película,
    extrayendo temporada, número de episodio y título limpio.
    """
    name_no_ext = os.path.splitext(filename)[0]

    # 1. Patrón S01E05 o S1E5
    m_se = re.search(r"(?:^|[\s._\-\[])s(\d{1,2})e(\d{1,3})(?:[\s._\-\]]|$)", name_no_ext, re.IGNORECASE)
    if m_se:
        season = int(m_se.group(1))
        episode = int(m_se.group(2))
        raw_title = name_no_ext[:m_se.start()].strip(" ._-")
        series_name = clean_title(raw_title) or clean_title(parent_folder) or "Serie"
        return {
            "is_series": True,
            "series_name": series_name,
            "season": season,
            "episode": episode,
            "clean_title": f"{series_name} {season}x{episode:02d}"
        }

    # 2. Patrón 1x05 o 01x05
    m_x = re.search(r"(?:^|[\s._\-\[])(\d{1,2})x(\d{1,3})(?:[\s._\-\]]|$)", name_no_ext, re.IGNORECASE)
    if m_x:
        season = int(m_x.group(1))
        episode = int(m_x.group(2))
        raw_title = name_no_ext[:m_x.start()].strip(" ._-")
        series_name = clean_title(raw_title) or clean_title(parent_folder) or "Serie"
        return {
            "is_series": True,
            "series_name": series_name,
            "season": season,
            "episode": episode,
            "clean_title": f"{series_name} {season}x{episode:02d}"
        }

    # 3. Patrón Cap.105 o Cap105 (Temporada 1, Ep 05)
    m_cap_concat = re.search(r"(?:capitulo|episodio|cap|ep)\.?\s*(\d{1,2})(\d{2})(?:[^0-9a-z]|$)", name_no_ext, re.IGNORECASE)
    if m_cap_concat:
        season = int(m_cap_concat.group(1))
        episode = int(m_cap_concat.group(2))
        raw_title = name_no_ext[:m_cap_concat.start()].strip(" ._-")
        series_name = clean_title(raw_title) or clean_title(parent_folder) or "Serie"
        return {
            "is_series": True,
            "series_name": series_name,
            "season": season,
            "episode": episode,
            "clean_title": f"{series_name} {season}x{episode:02d}"
        }

    # 4. Patrón de carpeta contenedora (ej: Carpeta 'Temporada 1' o 'Temp 1' dentro de 'Xena')
    m_parent_season = re.search(r"(?:temporada|temp\.?|season|t)\s*(\d+)", parent_folder, re.IGNORECASE)
    m_ep_only = re.search(r"(?:^|[\s._\-\[])(?:capitulo|episodio|cap|ep)?\.?\s*(\d{1,3})(?:[\s._\-\]]|$)", name_no_ext, re.IGNORECASE)
    if m_parent_season and m_ep_only:
        season = int(m_parent_season.group(1))
        episode = int(m_ep_only.group(1))
        # Extraer serie de la carpeta abuela si existe
        series_name = clean_title(name_no_ext[:m_ep_only.start()].strip(" ._-"))
        if not series_name:
            series_name = clean_title(re.sub(r"(?:temporada|temp\.?|season|t)\s*\d+", "", parent_folder, flags=re.I))
        if not series_name:
            series_name = "Serie"
        return {
            "is_series": True,
            "series_name": series_name,
            "season": season,
            "episode": episode,
            "clean_title": f"{series_name} {season}x{episode:02d}"
        }

    # 5. Es una película
    movie_title = clean_title(name_no_ext)
    return {
        "is_series": False,
        "series_name": "",
        "season": None,
        "episode": None,
        "clean_title": movie_title or name_no_ext
    }


def find_telegram_match(
    media_info: Dict[str, Any],
    file_size: int,
    channels_index: Dict[str, Any]
) -> Tuple[bool, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Busca si el archivo ya existe en los canales/temas de Telegram.
    Devuelve (existe: bool, info_telegram: dict, sugerencia_destino: dict).
    """
    norm_series = normalize_for_comparison(media_info.get("series_name", ""))
    season = media_info.get("season")
    episode = media_info.get("episode")
    norm_clean = normalize_for_comparison(media_info.get("clean_title", ""))

    # --- CASO 1: SERIE ---
    if media_info.get("is_series") and season is not None and episode is not None:
        best_channel = None
        best_topic = None
        matched_video = None

        # 1. Buscar en canales tipo foro (series)
        for ch in channels_index.get("forum_channels", []):
            ch_id = ch["id"]
            ch_title = ch["title"]
            topics = ch.get("topics", {})
            videos = ch.get("videos", {})

            for tid_str, tname in topics.items():
                if tid_str == "1" or tname.strip().lower() == "general":
                    continue

                norm_tname = normalize_for_comparison(tname)
                # Comprobar si el nombre del tema coincide con la serie y la temporada
                t_season_match = re.search(r"(?:temporada|season|temp\.?|t)\s*(\d+)", tname, re.IGNORECASE)
                t_season = int(t_season_match.group(1)) if t_season_match else None

                # Comprobar si coincide la serie
                is_series_match = is_series_title_match(media_info.get("series_name", ""), tname)

                if is_series_match and (t_season is None or t_season == season):
                    best_channel = {"id": ch_id, "title": ch_title}
                    best_topic = {"id": tid_str, "name": tname, "exists": True}

                    # Buscar si este capítulo exacto ya está en los vídeos de este tema
                    ep_str1 = f"{season}x{episode:02d}"
                    ep_str2 = f"{season}x{episode}"
                    ep_str3 = f"s{season:02d}e{episode:02d}"

                    for v_item in videos.values():
                        v_tid = str(v_item[0])
                        v_name = v_item[1]
                        v_size = v_item[2] if len(v_item) > 2 else 0

                        if v_tid != tid_str:
                            continue

                        norm_vname = normalize_for_comparison(v_name)
                        # Comprobar presencia del código de capítulo específico
                        has_ep = (
                            ep_str1 in norm_vname or
                            ep_str2 in norm_vname or
                            ep_str3 in norm_vname or
                            f"capitulo {episode}" in norm_vname or
                            f"cap {episode}" in norm_vname or
                            bool(re.search(rf"\b{season}x0*{episode}\b", norm_vname))
                        )
                        if has_ep:
                            # Encontrado en Telegram!
                            return True, {
                                "channel_id": ch_id,
                                "channel_title": ch_title,
                                "topic_id": tid_str,
                                "topic_name": tname,
                                "topic_title": tname,
                                "video_name": v_name,
                                "size": v_size
                            }, None

                elif is_series_match and best_channel is None:
                    # Coincide la serie en este canal aunque sea otra temporada
                    best_channel = {"id": ch_id, "title": ch_title}

        # Si llegamos aquí, no está en Telegram pero falta subirlo
        # Base de nombre de serie según el tema existente o el nombre detectado
        topic_series_base = media_info.get("series_name", "")
        if best_topic and best_topic.get("name"):
            t_clean = re.sub(r"-\s*(?:temporada|season|temp\.?|t)\s*\d+.*", "", best_topic["name"], flags=re.I).strip()
            if t_clean:
                topic_series_base = t_clean

        suggested_topic_name = f"{topic_series_base} - Temporada {season}"
        suggested_filename = f"{topic_series_base} {season}x{episode:02d}.mp4"

        if not best_channel and channels_index.get("forum_channels"):
            # Por defecto el primer canal de series
            first_ch = channels_index["forum_channels"][0]
            best_channel = {"id": first_ch["id"], "title": first_ch["title"]}

        suggestion = {
            "channel_id": best_channel["id"] if best_channel else (channels_index.get("default_channel_id")),
            "channel_title": best_channel["title"] if best_channel else "Canal Series",
            "topic_id": best_topic["id"] if best_topic else None,
            "topic_name": best_topic["name"] if best_topic else suggested_topic_name,
            "topic_exists": bool(best_topic and best_topic.get("exists")),
            "suggested_filename": suggested_filename
        }
        return False, None, suggestion

    # --- CASO 2: PELÍCULA ---
    else:
        movie_title = media_info.get("clean_title", "")
        norm_title = normalize_for_comparison(movie_title)

        for ch in channels_index.get("direct_channels", []):
            ch_id = ch["id"]
            ch_title = ch["title"]
            videos = ch.get("videos", {})

            for v_item in videos.values():
                v_name = v_item[1]
                v_size = v_item[2] if len(v_item) > 2 else 0

                # Quitar .mp4.001 etc
                base_vname = re.sub(r"\.(mp4|mkv|avi|mov|webm|m4v|wmv|flv|ts|mpg|mpeg)(?:\.\d{3,4})?$", "", v_name, flags=re.I)

                if is_movie_title_match(movie_title, base_vname):
                    return True, {
                        "channel_id": ch_id,
                        "channel_title": ch_title,
                        "topic_id": None,
                        "topic_name": None,
                        "topic_title": None,
                        "video_name": v_name,
                        "size": v_size
                    }, None

        # Si no existe, sugerir canal de películas
        movie_ch = None
        if channels_index.get("direct_channels"):
            movie_ch = channels_index["direct_channels"][0]

        suggestion = {
            "channel_id": movie_ch["id"] if movie_ch else channels_index.get("default_channel_id"),
            "channel_title": movie_ch["title"] if movie_ch else "Canal Películas",
            "topic_id": None,
            "topic_name": None,
            "topic_exists": True,
            "suggested_filename": f"{movie_title}.mp4" if movie_title else f"{media_info.get('clean_title', 'video')}.mp4"
        }
        return False, None, suggestion


def audit_local_folder(
    folder_path: str,
    recursive: bool = True,
    telegram_cache: Optional[Dict[str, Any]] = None,
    channels: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Ejecuta el análisis completo de una carpeta local frente a los canales de Telegram.
    """
    folder = Path(folder_path).resolve()
    if not folder.is_dir():
        raise FileNotFoundError(f"La ruta '{folder_path}' no es una carpeta válida o no existe.")

    # 1. Construir índice de Telegram
    cache = telegram_cache or {}
    ch_list = channels or []

    channels_index = {
        "forum_channels": [],
        "direct_channels": [],
        "default_channel_id": ch_list[0]["id"] if ch_list else None
    }

    for ch in ch_list:
        cid_str = str(ch["id"])
        c_entry = cache.get(cid_str, {})
        is_forum = bool(ch.get("forum", False) or c_entry.get("forum", False))
        item = {
            "id": ch["id"],
            "title": ch.get("title") or c_entry.get("title") or f"Canal {ch['id']}",
            "forum": is_forum,
            "topics": c_entry.get("topics", {}),
            "videos": c_entry.get("videos", {})
        }
        if is_forum:
            channels_index["forum_channels"].append(item)
        else:
            channels_index["direct_channels"].append(item)

    # 2. Recorrer archivos locales
    found_videos = []
    str_folder = str(folder)
    try:
        if recursive:
            for root, dirs, files in os.walk(str_folder):
                # Descartar carpetas ocultas o de sistema
                dirs[:] = [d for d in dirs if not d.startswith((".", "~$", "$RECYCLE", "System Volume Information"))]
                for fname in files:
                    ext = os.path.splitext(fname)[1].lower()
                    if ext in IGNORE_EXTENSIONS or ext not in VIDEO_EXTENSIONS:
                        continue
                    if fname.startswith((".", "~$")):
                        continue
                    full_p = os.path.join(root, fname)
                    try:
                        size = os.path.getsize(full_p)
                        if size < 100 * 1024:
                            continue
                        rel_path = os.path.relpath(full_p, str_folder)
                        parent_name = os.path.basename(root)
                        media_info = parse_media_filename(fname, parent_name)
                        found_videos.append({
                            "full_path": full_p,
                            "filename": fname,
                            "rel_path": rel_path,
                            "size": size,
                            "media_info": media_info
                        })
                    except Exception:
                        continue
        else:
            try:
                for fname in os.listdir(str_folder):
                    full_p = os.path.join(str_folder, fname)
                    try:
                        if not os.path.isfile(full_p):
                            continue
                        ext = os.path.splitext(fname)[1].lower()
                        if ext in IGNORE_EXTENSIONS or ext not in VIDEO_EXTENSIONS:
                            continue
                        if fname.startswith((".", "~$")):
                            continue
                        size = os.path.getsize(full_p)
                        if size < 100 * 1024:
                            continue
                        media_info = parse_media_filename(fname, os.path.basename(str_folder))
                        found_videos.append({
                            "full_path": full_p,
                            "filename": fname,
                            "rel_path": fname,
                            "size": size,
                            "media_info": media_info
                        })
                    except Exception:
                        continue
            except Exception:
                pass
    except Exception as e:
        log.warning("Error al escanear la carpeta '%s': %s", folder_path, e)

    # 3. Comparar cada archivo con el catálogo de Telegram
    items = []
    already_count = 0
    missing_count = 0
    total_bytes = 0
    uploaded_bytes = 0
    missing_bytes = 0

    # Ordenar por ruta relativa de forma natural
    def _nat_key(item):
        return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", item["rel_path"])]

    found_videos.sort(key=_nat_key)

    items = []
    for vid in found_videos:
        total_bytes += vid["size"]
        exists, tg_info, suggestion = find_telegram_match(
            vid["media_info"],
            vid["size"],
            channels_index
        )

        status = "already_uploaded" if exists else "missing"
        if exists:
            already_count += 1
            uploaded_bytes += vid["size"]
            sugg_trans = (tg_info and tg_info.get("video_name")) or vid["filename"]
            top_id = tg_info.get("topic_id") if tg_info else None
            if top_id is not None and str(top_id).isdigit():
                top_id = int(top_id)
            sugg_dest = {
                "category_id": tg_info.get("channel_id") if tg_info else None,
                "category_name": tg_info.get("channel_title") if tg_info else None,
                "topic_id": top_id,
                "topic_name": (tg_info.get("topic_name") or tg_info.get("topic_title")) if tg_info else None
            }
        else:
            missing_count += 1
            missing_bytes += vid["size"]
            sugg_dest = None
            sugg_trans = vid["filename"]
            if suggestion and suggestion.get("channel_id"):
                top_id = suggestion.get("topic_id")
                if top_id is not None and str(top_id).isdigit():
                    top_id = int(top_id)
                sugg_dest = {
                    "category_id": suggestion["channel_id"],
                    "category_name": suggestion.get("channel_title"),
                    "topic_id": top_id,
                    "topic_name": suggestion.get("topic_name")
                }
                sugg_trans = suggestion.get("suggested_filename") or vid["filename"]

        items.append({
            "id": re.sub(r"[^a-zA-Z0-9_-]", "_", vid["full_path"]),
            "full_path": vid["full_path"],
            "filename": vid["filename"],
            "relative_path": vid["rel_path"],
            "rel_path": vid["rel_path"],
            "size": vid["size"],
            "is_series": vid["media_info"]["is_series"],
            "series_name": vid["media_info"].get("series_name", ""),
            "season": vid["media_info"].get("season"),
            "episode": vid["media_info"].get("episode"),
            "clean_title": vid["media_info"].get("clean_title", vid["filename"]),
            "status": status,
            "match": tg_info,
            "telegram_info": tg_info,
            "suggested_destination": sugg_dest,
            "transformed_name": sugg_trans,
            "suggestion": suggestion
        })

    summary = {
        "total_files": len(items),
        "total_size": total_bytes,
        "uploaded_files": already_count,
        "uploaded_size": uploaded_bytes,
        "missing_files": missing_count,
        "missing_size": missing_bytes
    }

    return {
        "folder": str(folder),
        "recursive": recursive,
        "summary": summary,
        "total_files": len(items),
        "already_uploaded_count": already_count,
        "missing_count": missing_count,
        "missing_bytes": missing_bytes,
        "items": items
    }
