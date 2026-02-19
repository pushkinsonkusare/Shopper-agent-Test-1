#!/usr/bin/env python3
"""Remove 'KEY BENEFITS' and variants from overview and overview_summary columns in the CSV."""
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "Skincare _ SHISEIDO.csv"


def clean_key_benefits(text: str) -> str:
    if not text or not isinstance(text, str):
        return text
    # Remove lines that are only "KEY BENEFITS" or "KEY BENEFITS:" (with optional whitespace)
    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.upper() == "KEY BENEFITS" or stripped.upper().startswith("KEY BENEFITS:"):
            continue
        cleaned_lines.append(line)
    result = "\n".join(cleaned_lines)
    # Remove at start of string or after newline
    result = re.sub(
        r"(^|\n)\s*KEY BENEFITS\s*:\s*(\s*-\s*)?",
        r"\1",
        result,
        flags=re.IGNORECASE,
    )
    result = re.sub(
        r"(^|\n)\s*KEY BENEFITS\s*-\s*",
        r"\1",
        result,
        flags=re.IGNORECASE,
    )
    result = re.sub(
        r"(^|\n)\s*KEY BENEFITS\s+",
        r"\1",
        result,
        flags=re.IGNORECASE,
    )
    # Remove " KEY BENEFITS - " or " KEY BENEFITS: " or " KEY BENEFITS " anywhere in text
    result = re.sub(r"\s+KEY BENEFITS\s*-\s*", " ", result, flags=re.IGNORECASE)
    result = re.sub(r"\s+KEY BENEFITS\s*:\s*", " ", result, flags=re.IGNORECASE)
    result = re.sub(r"\s+KEY BENEFITS\s+", " ", result, flags=re.IGNORECASE)
    # Collapse multiple spaces and excessive newlines
    result = re.sub(r"  +", " ", result)
    result = re.sub(r"\n{3,}", "\n\n", result.strip())
    return result


def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)
    if not rows:
        return
    header = rows[0]
    try:
        overview_idx = header.index("overview")
        overview_summary_idx = header.index("overview_summary")
    except ValueError as e:
        print("Column not found:", e)
        return
    updated = 0
    for row in rows[1:]:
        if len(row) > max(overview_idx, overview_summary_idx):
            if row[overview_idx]:
                new_val = clean_key_benefits(row[overview_idx])
                if new_val != row[overview_idx]:
                    row[overview_idx] = new_val
                    updated += 1
            if row[overview_summary_idx]:
                new_val = clean_key_benefits(row[overview_summary_idx])
                if new_val != row[overview_summary_idx]:
                    row[overview_summary_idx] = new_val
                    updated += 1
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    print(f"Done. Cleaned overview/overview_summary in {updated} cells.")


if __name__ == "__main__":
    main()
