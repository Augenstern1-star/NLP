#!/usr/bin/env python3
"""Build offline data for the Dishu translator exhibit.

The script normalizes the two annotation exports in this workspace, derives a
small concept index, and writes both JSON and browser-loadable JS files.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DISHU_DATA_DIR = ROOT / "《地书》标注数据"
TEXT_DATA_DIR = ROOT / "《地书》白话版标注数据"
SYSTEM_DIR = ROOT / "地书标注系统 V1.0"
MANIFEST_PATH = SYSTEM_DIR / "data" / "segments_manifest.js"
OUT_DIR = ROOT / "data" / "translator"
BATCH_DIR = OUT_DIR / "llm_batches"

TEXT_TASKS = {
    "literal_gloss",
    "pragmatic_meaning",
    "free_translation",
    "event_description",
    "context_note",
}

CONCEPT_TEXT_TASKS = {
    "literal_gloss",
    "pragmatic_meaning",
    "free_translation",
    "event_description",
}

CONCEPT_TAG_TASKS = {
    "semantic_primitives",
    "pos_like_category",
    "morphological_features",
    "morphological_like_features",
}

TASK_ALIASES = {
    "morphological_like_features": "morphological_features",
    "morphological_features": "morphological_features",
}

NOISE_TERMS = {
    "表示",
    "图形",
    "语境",
    "实际",
    "含义",
    "字面",
    "对应",
    "自然",
    "语言",
    "自然语言",
    "当前",
    "上下文",
    "一个",
    "一种",
    "一些",
    "这个",
    "该图形",
    "该词",
    "该句",
    "可能",
    "进行",
    "用于",
    "任务",
    "标注",
    "说明",
    "关系",
    "无法",
    "判断",
    "其他",
    "无明显",
    "单位",
    "词",
    "短语",
    "句子",
    "整体",
    "核心",
    "成分",
    "状态",
    "动作",
    "事件",
    "物体",
    "人物",
    "东西",
}

TASK_KEYS_IN_TEXT_EXPORTS = {
    "pos_like_category",
    "morphological_like_features",
    "morphological_features",
    "semantic_primitives",
    "pragmatic_meaning",
    "literal_gloss",
    "discourse_relation",
    "free_translation",
    "event_description",
}


def read_json(path: Path) -> Any | None:
    try:
        text = path.read_text(encoding="utf-8-sig")
        return json.loads(text)
    except Exception:
        return None


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def write_js(path: Path, variable: str, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(f"window.{variable} = {body};\n", encoding="utf-8")


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def clean_task_id(task_id: str | None) -> str:
    if not task_id:
        return ""
    return TASK_ALIASES.get(task_id, task_id)


def list_json_txt_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*.txt") if path.is_file())


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return "；".join(normalize_text(item) for item in value if normalize_text(item))
    if isinstance(value, dict):
        return "；".join(f"{k}:{normalize_text(v)}" for k, v in value.items() if normalize_text(v))
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_option_label(value: str) -> str:
    value = normalize_text(value)
    if " / " in value:
        value = value.split(" / ", 1)[0]
    return value.strip()


def extract_cjk_terms(value: Any, *, include_single: bool = True) -> list[str]:
    text = normalize_text(value)
    if not text:
        return []

    text = re.sub(r"[A-Za-z][A-Za-z0-9_ -]*", " ", text)
    text = re.sub(r"[()（）\[\]【】{}<>《》“”\"'`]", " ", text)
    text = re.sub(r"[+\-=_—:：;；,，.。/、|\\!?！？\n\r\t]", " ", text)
    terms: list[str] = []
    for match in re.findall(r"[\u4e00-\u9fff]{1,12}", text):
        term = match.strip()
        if not include_single and len(term) < 2:
            continue
        if len(term) > 8:
            # Keep readable chunks from long explanations.
            for i in range(0, min(len(term), 16), 4):
                chunk = term[i : i + 4]
                if chunk:
                    terms.append(chunk)
            continue
        terms.append(term)
    return [term for term in terms if is_useful_term(term)]


def split_concept_terms(value: Any) -> list[str]:
    terms: list[str] = []
    raw = normalize_text(value)
    if raw:
        for part in re.split(r"[；;、,，/|]+", raw):
            terms.extend(extract_cjk_terms(part))
    return unique_keep_order(terms)


def is_useful_term(term: str) -> bool:
    if not term:
        return False
    if term in NOISE_TERMS:
        return False
    if len(term) > 8:
        return False
    if len(term) == 1 and term not in {"我", "他", "她", "走", "跑", "笑", "哭", "买", "看", "问", "停"}:
        return False
    if re.fullmatch(r"[一二三四五六七八九十百千万亿]+", term):
        return False
    return True


def unique_keep_order(items: list[Any]) -> list[Any]:
    seen = set()
    result = []
    for item in items:
        key = json.dumps(item, ensure_ascii=False, sort_keys=True) if isinstance(item, (dict, list)) else item
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def load_manifest() -> tuple[dict[str, dict[str, Any]], dict[int, dict[str, Any]]]:
    text = MANIFEST_PATH.read_text(encoding="utf-8-sig")
    match = re.search(r"window\.SEGMENTS_MANIFEST\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not match:
        raise ValueError(f"Cannot parse manifest: {MANIFEST_PATH}")
    manifest = json.loads(match.group(1))
    by_target: dict[str, dict[str, Any]] = {}
    by_index: dict[int, dict[str, Any]] = {}
    for seg in manifest.get("segments", []):
        target_id = f"seg_{seg['id_str']}"
        rel_file_path = str(seg.get("rel_file_path", "")).replace("\\", "/")
        image_path = f"../地书标注系统 V1.0/{rel_file_path}"
        record = {
            "target_id": target_id,
            "global_index": int(seg["global_index"]),
            "display_label": seg.get("display_label", ""),
            "page_side_key": seg.get("page_side_key", ""),
            "line_no": seg.get("line_no"),
            "image_path": image_path,
            "width": seg.get("width"),
            "height": seg.get("height"),
        }
        by_target[target_id] = record
        by_target[seg["id_str"]] = record
        by_index[int(seg["global_index"])] = record
    return by_target, by_index


def normalize_dishu_annotations(
    segments_by_target: dict[str, dict[str, Any]],
    segments_by_index: dict[int, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    targets: dict[str, dict[str, Any]] = {}

    for path in list_json_txt_files(DISHU_DATA_DIR):
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        source_file = rel(path)
        session = data.get("session", {}) if isinstance(data.get("session"), dict) else {}

        for group in data.get("groups", []) or []:
            if not isinstance(group, dict) or not group.get("id"):
                continue
            group_id = str(group["id"])
            leaf_start = safe_int(group.get("leaf_start"))
            leaf_end = safe_int(group.get("leaf_end"))
            image_paths: list[str] = []
            display_labels: list[str] = []
            if leaf_start and leaf_end and leaf_end >= leaf_start:
                for idx in range(leaf_start, leaf_end + 1):
                    seg = segments_by_index.get(idx)
                    if seg:
                        image_paths.append(seg["image_path"])
                        display_labels.append(seg.get("display_label", ""))
            targets[group_id] = {
                "target_id": group_id,
                "target_type": "group",
                "source_file": source_file,
                "leaf_start": leaf_start,
                "leaf_end": leaf_end,
                "leaf_count": len(image_paths),
                "children": group.get("children", []),
                "image_paths": image_paths,
                "display_labels": display_labels,
                "page_range": {
                    "start": session.get("pageStartKey", ""),
                    "end": session.get("pageEndKey", ""),
                },
                "annotations": defaultdict(list),
            }

        for annotation in data.get("annotations", []) or []:
            if not isinstance(annotation, dict):
                continue
            target_id = str(annotation.get("target_id", "")).strip()
            task_id = clean_task_id(str(annotation.get("task_id", "")).strip())
            if not target_id or not task_id:
                continue
            target_type = "group" if target_id.startswith("grp_") else "atom"
            value = annotation.get("value")
            row = {
                "source": "dishu",
                "source_file": source_file,
                "target_id": target_id,
                "target_type": target_type,
                "task_id": task_id,
                "value": value,
                "value_text": normalize_text(value),
                "updated_at": annotation.get("updated_at", ""),
            }
            rows.append(row)

            target = targets.get(target_id)
            if not target and target_type == "atom":
                seg = segments_by_target.get(target_id)
                target = {
                    "target_id": target_id,
                    "target_type": "atom",
                    "source_file": source_file,
                    "leaf_start": seg.get("global_index") if seg else None,
                    "leaf_end": seg.get("global_index") if seg else None,
                    "leaf_count": 1 if seg else 0,
                    "children": [],
                    "image_paths": [seg["image_path"]] if seg else [],
                    "display_labels": [seg.get("display_label", "")] if seg else [],
                    "page_range": {
                        "start": session.get("pageStartKey", ""),
                        "end": session.get("pageEndKey", ""),
                    },
                    "annotations": defaultdict(list),
                }
                targets[target_id] = target
            if target:
                target["annotations"][task_id].append(value)

    for target in targets.values():
        target["annotations"] = {
            task_id: unique_keep_order(values)
            for task_id, values in target.get("annotations", {}).items()
            if values
        }
    return rows, targets


def normalize_text_annotations() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in list_json_txt_files(TEXT_DATA_DIR):
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        source_file = rel(path)
        units = data.get("units", []) if isinstance(data.get("units"), list) else []
        unit_map: dict[str, dict[str, Any]] = {}
        for unit in units:
            if not isinstance(unit, dict):
                continue
            unit_id = str(unit.get("unit_id") or unit.get("id") or "").strip()
            if not unit_id:
                continue
            unit_map[unit_id] = unit

        for annotation in data.get("annotations", []) or []:
            if not isinstance(annotation, dict):
                continue
            if annotation.get("task_id") and "value" in annotation:
                row = make_text_row(annotation, unit_map, source_file)
                if row:
                    rows.append(row)
                continue

            unit_id = str(annotation.get("unit_id") or annotation.get("target_id") or "").strip()
            unit = unit_map.get(unit_id, {})
            for key, value in annotation.items():
                task_id = clean_task_id(key)
                if task_id not in {clean_task_id(k) for k in TASK_KEYS_IN_TEXT_EXPORTS}:
                    continue
                synthetic = {
                    "target_id": unit_id,
                    "target_type": infer_text_target_type(unit, source_file),
                    "task_id": task_id,
                    "value": value,
                    "confidence": annotation.get("confidence"),
                    "llm_used": annotation.get("llm_used"),
                    "llm_name": annotation.get("llm_name"),
                    "annotator_note": annotation.get("annotator_note", ""),
                }
                row = make_text_row(synthetic, unit_map, source_file)
                if row:
                    rows.append(row)
    return rows


def make_text_row(
    annotation: dict[str, Any],
    unit_map: dict[str, dict[str, Any]],
    source_file: str,
) -> dict[str, Any] | None:
    target_id = str(annotation.get("target_id") or annotation.get("unit_id") or "").strip()
    task_id = clean_task_id(str(annotation.get("task_id", "")).strip())
    if not target_id or not task_id:
        return None
    unit = unit_map.get(target_id, {})
    target_type = str(annotation.get("target_type") or infer_text_target_type(unit, source_file))
    unit_text = normalize_text(unit.get("text") or unit.get("token") or annotation.get("text") or "")
    value = annotation.get("value")
    return {
        "source": "natural_text",
        "source_file": source_file,
        "target_id": target_id,
        "target_type": target_type,
        "unit_text": unit_text,
        "task_id": task_id,
        "value": value,
        "value_text": normalize_text(value),
        "confidence": annotation.get("confidence"),
        "llm_used": annotation.get("llm_used"),
        "llm_name": annotation.get("llm_name"),
        "annotator_note": annotation.get("annotator_note", ""),
    }


def infer_text_target_type(unit: dict[str, Any], source_file: str) -> str:
    if unit.get("unit_type"):
        return str(unit["unit_type"])
    if "句标注" in source_file:
        return "sentence"
    return "word"


def safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except Exception:
        return None


def build_text_contexts(text_rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_target: dict[tuple[str, str], dict[str, Any]] = {}
    for row in text_rows:
        key = (row["source_file"], row["target_id"])
        target = by_target.setdefault(
            key,
            {
                "source_file": row["source_file"],
                "target_id": row["target_id"],
                "target_type": row["target_type"],
                "unit_text": row.get("unit_text", ""),
                "annotations": defaultdict(list),
            },
        )
        target["annotations"][row["task_id"]].append(row["value"])

    contexts: dict[str, dict[str, Any]] = {}
    for target in by_target.values():
        terms = []
        if target.get("unit_text"):
            terms.append(target["unit_text"])
        for task_id in ("literal_gloss", "pragmatic_meaning", "free_translation"):
            for value in target["annotations"].get(task_id, []):
                terms.extend(split_concept_terms(value))
        tags = []
        for value in target["annotations"].get("semantic_primitives", []):
            if isinstance(value, list):
                tags.extend(normalize_option_label(str(item)) for item in value)
            else:
                tags.extend(split_concept_terms(value))
        for term in unique_keep_order([t for t in terms if is_useful_term(t)]):
            item = contexts.setdefault(term, {"contexts": [], "semantic_tags": Counter(), "synonyms": Counter()})
            if target.get("unit_text"):
                item["synonyms"][target["unit_text"]] += 1
            for tag in tags:
                if tag:
                    item["semantic_tags"][tag] += 1
            context = normalize_text(
                first_value(target["annotations"].get("pragmatic_meaning"))
                or first_value(target["annotations"].get("free_translation"))
                or target.get("unit_text")
            )
            if context:
                item["contexts"].append(context)
    return contexts


def first_value(values: Any) -> Any:
    if isinstance(values, list) and values:
        return values[0]
    return values


def build_concepts(
    targets: dict[str, dict[str, Any]],
    text_contexts: dict[str, dict[str, Any]],
    *,
    max_concepts: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    concept_buckets: dict[str, dict[str, Any]] = {}

    for target in targets.values():
        if not target.get("image_paths"):
            continue
        annotations = target.get("annotations", {})
        target_terms: list[str] = []
        target_tags: list[str] = []
        for task_id, values in annotations.items():
            if task_id in CONCEPT_TEXT_TASKS:
                for value in values:
                    target_terms.extend(split_concept_terms(value))
            elif task_id in CONCEPT_TAG_TASKS:
                for value in values:
                    if isinstance(value, list):
                        target_tags.extend(normalize_option_label(str(item)) for item in value)
                    else:
                        target_tags.extend(split_concept_terms(value))

        target_terms = unique_keep_order([term for term in target_terms if is_useful_term(term)])
        if not target_terms:
            continue

        for term in target_terms:
            bucket = concept_buckets.setdefault(
                term,
                {
                    "label": term,
                    "targets": {},
                    "synonyms": Counter(),
                    "semantic_tags": Counter(),
                    "contexts": [],
                    "source_terms": Counter(),
                },
            )
            bucket["source_terms"][term] += 1
            for sibling in target_terms:
                if sibling != term:
                    bucket["synonyms"][sibling] += 1
            for tag in target_tags:
                if tag and tag != term:
                    bucket["semantic_tags"][tag] += 1
            bucket["targets"][target["target_id"]] = target

    for term, ctx in text_contexts.items():
        matched_keys = []
        if term in concept_buckets:
            matched_keys.append(term)
        else:
            for key in concept_buckets.keys():
                if len(term) >= 2 and (term in key or key in term):
                    matched_keys.append(key)
                    if len(matched_keys) >= 3:
                        break
        for key in matched_keys:
            bucket = concept_buckets[key]
            for synonym, count in ctx["synonyms"].items():
                if synonym != key and is_useful_term(synonym):
                    bucket["synonyms"][synonym] += count
            for tag, count in ctx["semantic_tags"].items():
                if is_useful_term(tag):
                    bucket["semantic_tags"][tag] += count
            bucket["contexts"].extend(ctx["contexts"][:3])

    candidates: list[dict[str, Any]] = []
    for label, bucket in concept_buckets.items():
        targets_for_label = sorted(
            bucket["targets"].values(),
            key=lambda target: score_target_for_concept(target, label),
            reverse=True,
        )
        if not targets_for_label:
            continue
        primary_score = score_target_for_concept(targets_for_label[0], label)
        score = primary_score + math.log1p(len(targets_for_label)) * 0.4 + min(len(label), 4) * 0.06
        candidates.append({"label": label, "score": score, "bucket": bucket, "targets": targets_for_label})

    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected = candidates[:max_concepts]
    concepts = []
    for idx, item in enumerate(selected, start=1):
        label = item["label"]
        bucket = item["bucket"]
        targets_for_label = item["targets"][:4]
        confidence = min(0.96, 0.55 + math.log1p(len(item["targets"])) / 8 + min(item["score"], 5) / 20)
        synonyms = [label]
        synonyms.extend([term for term, _ in bucket["synonyms"].most_common(8) if is_useful_term(term)])
        semantic_tags = [tag for tag, _ in bucket["semantic_tags"].most_common(6)]
        contexts = unique_keep_order([ctx for ctx in bucket["contexts"] if ctx])[:4]
        concept = {
            "id": f"c_{idx:04d}",
            "label": label,
            "synonyms": unique_keep_order(synonyms)[:10],
            "semantic_tags": semantic_tags,
            "confidence": round(confidence, 2),
            "explanation": make_explanation(label, targets_for_label[0], contexts),
            "possible_misreadings": make_misreadings(label, targets_for_label[0]),
            "primary": target_to_candidate(targets_for_label[0], label),
            "candidates": [target_to_candidate(target, label) for target in targets_for_label],
            "natural_text_contexts": contexts,
        }
        concepts.append(concept)

    concept_index = {
        "project": "《地书翻译机》",
        "schema_version": "1.0",
        "generated_by": "scripts/build_translator_data.py",
        "source_note": "Derived from local Dishu and natural-language annotation exports; no runtime model API is required.",
        "concept_count": len(concepts),
        "concepts": concepts,
    }

    concept_candidates = {
        "schema_version": "1.0",
        "candidate_count": len(candidates),
        "candidates": [
            {
                "label": item["label"],
                "score": round(item["score"], 4),
                "target_count": len(item["targets"]),
                "sample_targets": [
                    target_to_candidate(target, item["label"]) for target in item["targets"][:2]
                ],
                "candidate_synonyms": [
                    term for term, _ in item["bucket"]["synonyms"].most_common(8) if is_useful_term(term)
                ],
            }
            for item in candidates[: max(max_concepts * 2, 300)]
        ],
    }

    return concept_index, concept_candidates


def score_target_for_concept(target: dict[str, Any], label: str) -> float:
    annotations = target.get("annotations", {})
    value_text = " ".join(normalize_text(v) for values in annotations.values() for v in values)
    score = 0.0
    if label in value_text:
        score += 3.0
    if target.get("target_type") == "group":
        score += 1.0
    leaf_count = int(target.get("leaf_count") or 0)
    if 2 <= leaf_count <= 7:
        score += 1.3
    elif leaf_count == 1:
        score += 0.4
    elif leaf_count > 10:
        score -= 0.8
    for task_id in ("literal_gloss", "pragmatic_meaning", "free_translation", "event_description"):
        if annotations.get(task_id):
            score += 0.5
    return score


def make_explanation(label: str, target: dict[str, Any], contexts: list[str]) -> str:
    annotations = target.get("annotations", {})
    pragmatic = normalize_text(first_value(annotations.get("pragmatic_meaning")))
    literal = normalize_text(first_value(annotations.get("literal_gloss")))
    if pragmatic:
        return f"标注中将这组图形解释为“{pragmatic}”，因此可作为“{label}”的图形候选。"
    if literal:
        return f"标注中的字面对应词包含“{literal}”，因此暂时用它承载“{label}”。"
    if contexts:
        return f"自然文本标注中出现过相近语境：“{contexts[0]}”。"
    return f"根据已有标注和图形组合频次，暂时把它归入“{label}”。"


def make_misreadings(label: str, target: dict[str, Any]) -> list[str]:
    annotations = target.get("annotations", {})
    sources = []
    for value in annotations.get("ambiguity_sources", []):
        if isinstance(value, list):
            sources.extend(normalize_option_label(str(item)) for item in value)
        else:
            sources.extend(split_concept_terms(value))
    if sources:
        return [f"可能因{source}被理解成其他相近概念" for source in unique_keep_order(sources)[:3]]
    return [
        f"可能被当作单纯的“{label}”图标，而忽略上下文关系",
        "如果缺少前后图形，动作、地点或情绪角色可能被调换",
    ]


def target_to_candidate(target: dict[str, Any], label: str) -> dict[str, Any]:
    annotations = target.get("annotations", {})
    return {
        "target_id": target["target_id"],
        "target_type": target.get("target_type", ""),
        "confidence": round(min(0.96, 0.58 + score_target_for_concept(target, label) / 10), 2),
        "image_paths": target.get("image_paths", [])[:8],
        "leaf_range": [target.get("leaf_start"), target.get("leaf_end")],
        "display_labels": target.get("display_labels", [])[:8],
        "literal_gloss": normalize_text(first_value(annotations.get("literal_gloss"))),
        "pragmatic_meaning": normalize_text(first_value(annotations.get("pragmatic_meaning"))),
        "free_translation": normalize_text(first_value(annotations.get("free_translation"))),
        "event_description": normalize_text(first_value(annotations.get("event_description"))),
        "source_file": target.get("source_file", ""),
    }


def image_path_exists(image_path: str) -> bool:
    normalized = str(image_path).replace("\\", "/")
    if normalized.startswith("../"):
        normalized = normalized[3:]
    return (ROOT / normalized).exists()


def summarize_image_paths(concept_index: dict[str, Any]) -> dict[str, int]:
    paths: set[str] = set()
    for concept in concept_index.get("concepts", []):
        targets = []
        if isinstance(concept.get("primary"), dict):
            targets.append(concept["primary"])
        targets.extend(target for target in concept.get("candidates", []) if isinstance(target, dict))
        for target in targets:
            paths.update(str(item) for item in target.get("image_paths", []) if item)

    missing = [item for item in paths if not image_path_exists(item)]
    return {
        "image_paths": len(paths),
        "missing_image_paths": len(missing),
    }


def build_examples(concept_index: dict[str, Any]) -> dict[str, Any]:
    concepts = concept_index["concepts"]
    lookup: dict[str, dict[str, Any]] = {}
    for concept in concepts:
        for term in concept.get("synonyms", []):
            lookup.setdefault(normalize_lookup_key(term), concept)
        lookup.setdefault(normalize_lookup_key(concept["label"]), concept)

    templates = [
        ("我走进书店，想到礼物。", ["走进", "书店", "想到", "礼物"]),
        ("晚上我看时间，然后关灯睡觉。", ["晚上", "看时间", "关灯", "睡觉"]),
        ("手机震动，电话响了。", ["手机震动", "电话响了"]),
        ("我听音乐，又打开空调。", ["听音乐", "打开空调"]),
        ("他看到警察来了，有点害怕。", ["看到", "警察来了", "害怕"]),
        ("我下楼打车，然后回家。", ["下楼", "打车", "回家"]),
        ("她开心地笑，和我打招呼。", ["开心", "笑", "打招呼"]),
        ("排队上厕所，等了好一阵。", ["排队", "上厕所", "好一阵"]),
        ("我走来走去，四处张望。", ["走来走去", "四处张望"]),
        ("我关掉电视，闭眼睡觉。", ["关掉电视", "闭眼睡觉"]),
        ("看见新闻，我很震惊。", ["看见", "新闻", "震惊"]),
        ("电梯到了，我走了出去。", ["电梯", "走出"]),
        ("红灯亮了，我停在路口。", ["红灯", "停", "路口"]),
    ]

    examples = []
    for sentence, wanted_terms in templates:
        sequence = []
        for term in wanted_terms:
            concept = resolve_concept(term, lookup, concepts)
            if concept:
                sequence.append({"term": term, "concept_id": concept["id"]})
        if len(sequence) >= 2:
            examples.append({"sentence": sentence, "sequence": sequence})
        if len(examples) >= 10:
            break

    if len(examples) < 8:
        for i in range(0, min(len(concepts), 32), 4):
            chosen = concepts[i : i + 4]
            if len(chosen) >= 2:
                examples.append(
                    {
                        "sentence": "，".join(concept["label"] for concept in chosen) + "。",
                        "sequence": [
                            {"term": concept["label"], "concept_id": concept["id"]} for concept in chosen
                        ],
                    }
                )
            if len(examples) >= 10:
                break

    return {
        "schema_version": "1.0",
        "examples": examples[:10],
    }


def normalize_lookup_key(text: str) -> str:
    return re.sub(r"\s+", "", normalize_text(text))


def resolve_concept(
    term: str,
    lookup: dict[str, dict[str, Any]],
    concepts: list[dict[str, Any]],
) -> dict[str, Any] | None:
    key = normalize_lookup_key(term)
    if key in lookup:
        return lookup[key]
    for candidate_key, concept in lookup.items():
        if len(key) >= 2 and (key in candidate_key or candidate_key in key):
            return concept
    for concept in concepts:
        if len(key) >= 2 and key in normalize_lookup_key(concept["label"]):
            return concept
    return None


def write_llm_batches(concept_candidates: dict[str, Any], *, batch_size: int) -> int:
    BATCH_DIR.mkdir(parents=True, exist_ok=True)
    for old in BATCH_DIR.glob("batch_*.json"):
        old.unlink()
    candidates = concept_candidates["candidates"]
    batch_count = 0
    for start in range(0, len(candidates), batch_size):
        batch = candidates[start : start + batch_size]
        if not batch:
            continue
        batch_count += 1
        payload = {
            "batch_id": f"batch_{batch_count:03d}",
            "instruction": (
                "Merge near-synonymous Chinese concept candidates, choose one readable label, "
                "keep only the strongest Dishu image targets, and write concise explanations "
                "plus possible misreadings. Return JSON with concept_id, label, synonyms, "
                "semantic_tags, explanation, possible_misreadings, and selected_target_ids."
            ),
            "candidates": batch,
        }
        write_json(BATCH_DIR / f"batch_{batch_count:03d}.json", payload)
    return batch_count


def build_all(max_concepts: int, batch_size: int) -> dict[str, Any]:
    segments_by_target, segments_by_index = load_manifest()
    dishu_rows, dishu_targets = normalize_dishu_annotations(segments_by_target, segments_by_index)
    text_rows = normalize_text_annotations()
    text_contexts = build_text_contexts(text_rows)
    concept_index, concept_candidates = build_concepts(
        dishu_targets,
        text_contexts,
        max_concepts=max_concepts,
    )
    examples = build_examples(concept_index)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_jsonl(OUT_DIR / "normalized_dishu_annotations.jsonl", dishu_rows)
    write_jsonl(OUT_DIR / "normalized_text_annotations.jsonl", text_rows)
    write_json(OUT_DIR / "concept_candidates.json", concept_candidates)
    write_json(OUT_DIR / "concept_index.json", concept_index)
    write_json(OUT_DIR / "examples.json", examples)
    write_js(OUT_DIR / "concept_index.js", "DISHU_CONCEPT_INDEX", concept_index)
    write_js(OUT_DIR / "examples.js", "DISHU_TRANSLATOR_EXAMPLES", examples)
    batch_count = write_llm_batches(concept_candidates, batch_size=batch_size)
    image_summary = summarize_image_paths(concept_index)

    summary = {
        "dishu_annotation_rows": len(dishu_rows),
        "dishu_targets": len(dishu_targets),
        "text_annotation_rows": len(text_rows),
        "concept_candidates": concept_candidates["candidate_count"],
        "concept_index": concept_index["concept_count"],
        "examples": len(examples["examples"]),
        "llm_batches": batch_count,
        **image_summary,
    }
    write_json(OUT_DIR / "build_summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-concepts", type=int, default=260)
    parser.add_argument("--batch-size", type=int, default=30)
    args = parser.parse_args()
    summary = build_all(max_concepts=args.max_concepts, batch_size=args.batch_size)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
