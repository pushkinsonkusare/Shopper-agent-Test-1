#!/usr/bin/env python3
"""Add Coupon_Applicable column to Skincare _ SHISEIDO.csv with randomized distribution:
   SAVE10 50%, SAVE15 25%, SAVE20 15%, blank 10%."""
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CSV_PATH = ROOT / "Skincare _ SHISEIDO.csv"
COLUMN_NAME = "Coupon_Applicable"

# Ratios: SAVE10 50%, SAVE15 25%, SAVE20 15%, blank 10%
COUPON_DISTRIBUTION = [
    ("SAVE10", 0.50),
    ("SAVE15", 0.25),
    ("SAVE20", 0.15),
    ("", 0.10),
]


def main():
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    n = len(rows)
    if n == 0:
        print("No data rows found.")
        return

    # Build list of coupon values by count (round so total = n)
    counts = []
    remainder = n
    for code, ratio in COUPON_DISTRIBUTION[:-1]:
        c = round(n * ratio)
        counts.append((code, c))
        remainder -= c
    # Last bucket gets the remainder so sum is exactly n
    counts.append((COUPON_DISTRIBUTION[-1][0], remainder))

    coupon_values = []
    for code, count in counts:
        coupon_values.extend([code] * count)
    random.shuffle(coupon_values)

    # Append new column to header and each row
    if COLUMN_NAME not in header:
        header.append(COLUMN_NAME)

    for i, row in enumerate(rows):
        value = coupon_values[i] if i < len(coupon_values) else ""
        row.append(value)
        rows[i] = row

    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)

    # Report
    from collections import Counter
    actual = Counter(coupon_values)
    print(f"Added column '{COLUMN_NAME}' to {CSV_PATH}")
    print(f"Total data rows: {n}")
    for code, count in counts:
        label = repr(code) if code else "(blank)"
        print(f"  {label}: {count} ({100 * count / n:.1f}%)")
    print("Actual distribution:", dict(actual))


if __name__ == "__main__":
    main()
