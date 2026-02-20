#!/usr/bin/env python3
"""Add Promotions column to Skincare _ SHISEIDO.csv with randomized item-level promotions."""

import csv
import random

CSV_PATH = "Skincare _ SHISEIDO.csv"
PROMOTIONS = [
    "10% off on skin essentials",
    "15% off on new range",
    "5% off on new launches",
]

def main():
    with open(CSV_PATH, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)

    if not rows:
        print("CSV is empty")
        return

    header = rows[0]
    if "Promotions" in header:
        print("Promotions column already exists")
        return

    header.append("Promotions")
    data_rows = rows[1:]

    for row in data_rows:
        while len(row) < len(header) - 1:
            row.append("")
        row.append(random.choice(PROMOTIONS))

    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(data_rows)

    print(f"Added Promotions column with randomized values across {len(data_rows)} rows")

if __name__ == "__main__":
    main()
