"""
train_model.py
==============
Production-grade training script for the home services pricing model.

What it does
------------
1. Defines a rich, realistic training dataset (30 rows) covering every
   major service category and a wide rating range (3.5 – 5.0).
2. Builds the full feature matrix using pricing_model.build_features(),
   including the three interaction / derived features introduced in v2.
3. Trains a Ridge Regression model (L2 regularisation avoids over-fit on
   a small dataset better than plain OLS).
4. Evaluates on a held-out validation split and prints metrics.
5. Serialises the model to pricing_model.pkl.

Run
---
    python train_model.py

Requirements
------------
    pip install numpy pandas scikit-learn
"""

from __future__ import annotations

import logging
import os
import pickle
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_score

from pricing_model import FEATURE_ORDER, build_features

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("train_model")

# ---------------------------------------------------------------------------
# Training dataset
# Design principles:
#   • Prices increase monotonically with rating for comparable services.
#   • Each major category has ≥ 2 rows across a rating spread.
#   • Covers low-rating (3.5–3.9) rows to teach the model downward scaling.
# ---------------------------------------------------------------------------
TRAINING_DATA: List[Dict[str, Any]] = [
    # ── Appliance Repair ────────────────────────────────────────────────────
    {"serviceName": "AC repair",           "serviceCategory": "Appliance Repair",
     "serviceBasePrice": 1200, "serviceRating": 3.8, "providerRating": 3.9,
     "customerUrgency": 5, "servicePopularity": 45, "price": 1090},

    {"serviceName": "AC repair",           "serviceCategory": "Appliance Repair",
     "serviceBasePrice": 1200, "serviceRating": 4.2, "providerRating": 4.3,
     "customerUrgency": 6, "servicePopularity": 65, "price": 1350},

    {"serviceName": "AC repair",           "serviceCategory": "Appliance Repair",
     "serviceBasePrice": 1200, "serviceRating": 4.6, "providerRating": 4.7,
     "customerUrgency": 8, "servicePopularity": 80, "price": 1580},

    {"serviceName": "AC repair",           "serviceCategory": "Appliance Repair",
     "serviceBasePrice": 1200, "serviceRating": 4.9, "providerRating": 5.0,
     "customerUrgency": 9, "servicePopularity": 95, "price": 1820},

    {"serviceName": "Water heater service","serviceCategory": "Appliance Repair",
     "serviceBasePrice": 1100, "serviceRating": 4.1, "providerRating": 4.2,
     "customerUrgency": 6, "servicePopularity": 60, "price": 1230},

    {"serviceName": "Water heater service","serviceCategory": "Appliance Repair",
     "serviceBasePrice": 1100, "serviceRating": 4.7, "providerRating": 4.8,
     "customerUrgency": 8, "servicePopularity": 82, "price": 1470},

    {"serviceName": "Refrigerator repair", "serviceCategory": "Appliance Repair",
     "serviceBasePrice": 900,  "serviceRating": 4.4, "providerRating": 4.5,
     "customerUrgency": 7, "servicePopularity": 70, "price": 1060},

    # ── Plumbing ─────────────────────────────────────────────────────────────
    {"serviceName": "Plumbing leak fix",   "serviceCategory": "Plumbing",
     "serviceBasePrice": 800,  "serviceRating": 3.6, "providerRating": 3.7,
     "customerUrgency": 7, "servicePopularity": 40, "price": 730},

    {"serviceName": "Plumbing leak fix",   "serviceCategory": "Plumbing",
     "serviceBasePrice": 800,  "serviceRating": 4.1, "providerRating": 4.2,
     "customerUrgency": 8, "servicePopularity": 60, "price": 940},

    {"serviceName": "Plumbing leak fix",   "serviceCategory": "Plumbing",
     "serviceBasePrice": 800,  "serviceRating": 4.8, "providerRating": 4.9,
     "customerUrgency": 9, "servicePopularity": 90, "price": 1160},

    {"serviceName": "Bathroom fitting",    "serviceCategory": "Plumbing",
     "serviceBasePrice": 1000, "serviceRating": 4.5, "providerRating": 4.6,
     "customerUrgency": 5, "servicePopularity": 55, "price": 1180},

    # ── Electrical ───────────────────────────────────────────────────────────
    {"serviceName": "Electrical wiring",   "serviceCategory": "Electrical",
     "serviceBasePrice": 900,  "serviceRating": 3.9, "providerRating": 4.0,
     "customerUrgency": 5, "servicePopularity": 50, "price": 860},

    {"serviceName": "Electrical wiring",   "serviceCategory": "Electrical",
     "serviceBasePrice": 900,  "serviceRating": 4.5, "providerRating": 4.7,
     "customerUrgency": 6, "servicePopularity": 75, "price": 1060},

    {"serviceName": "Electrical wiring",   "serviceCategory": "Electrical",
     "serviceBasePrice": 900,  "serviceRating": 4.9, "providerRating": 5.0,
     "customerUrgency": 8, "servicePopularity": 88, "price": 1280},

    {"serviceName": "Switch board repair", "serviceCategory": "Electrical",
     "serviceBasePrice": 600,  "serviceRating": 4.3, "providerRating": 4.4,
     "customerUrgency": 6, "servicePopularity": 60, "price": 720},

    # ── Painting ─────────────────────────────────────────────────────────────
    {"serviceName": "Wall painting",       "serviceCategory": "Painting",
     "serviceBasePrice": 700,  "serviceRating": 3.8, "providerRating": 3.9,
     "customerUrgency": 4, "servicePopularity": 45, "price": 650},

    {"serviceName": "Wall painting",       "serviceCategory": "Painting",
     "serviceBasePrice": 700,  "serviceRating": 4.4, "providerRating": 4.5,
     "customerUrgency": 6, "servicePopularity": 65, "price": 830},

    {"serviceName": "Wall painting",       "serviceCategory": "Painting",
     "serviceBasePrice": 700,  "serviceRating": 4.8, "providerRating": 4.9,
     "customerUrgency": 7, "servicePopularity": 80, "price": 980},

    # ── Carpentry ────────────────────────────────────────────────────────────
    {"serviceName": "Sofa repair",         "serviceCategory": "Carpentry",
     "serviceBasePrice": 650,  "serviceRating": 3.7, "providerRating": 3.8,
     "customerUrgency": 4, "servicePopularity": 35, "price": 590},

    {"serviceName": "Sofa repair",         "serviceCategory": "Carpentry",
     "serviceBasePrice": 650,  "serviceRating": 4.3, "providerRating": 4.4,
     "customerUrgency": 5, "servicePopularity": 55, "price": 740},

    {"serviceName": "Sofa repair",         "serviceCategory": "Carpentry",
     "serviceBasePrice": 650,  "serviceRating": 4.8, "providerRating": 4.9,
     "customerUrgency": 7, "servicePopularity": 75, "price": 910},

    {"serviceName": "Wooden door fitting", "serviceCategory": "Carpentry",
     "serviceBasePrice": 750,  "serviceRating": 4.5, "providerRating": 4.6,
     "customerUrgency": 5, "servicePopularity": 60, "price": 890},

    # ── Cleaning ─────────────────────────────────────────────────────────────
    {"serviceName": "Home deep cleaning",  "serviceCategory": "Cleaning",
     "serviceBasePrice": 500,  "serviceRating": 3.5, "providerRating": 3.6,
     "customerUrgency": 3, "servicePopularity": 40, "price": 440},

    {"serviceName": "Home deep cleaning",  "serviceCategory": "Cleaning",
     "serviceBasePrice": 500,  "serviceRating": 4.2, "providerRating": 4.3,
     "customerUrgency": 4, "servicePopularity": 65, "price": 560},

    {"serviceName": "Home deep cleaning",  "serviceCategory": "Cleaning",
     "serviceBasePrice": 500,  "serviceRating": 4.7, "providerRating": 4.8,
     "customerUrgency": 6, "servicePopularity": 80, "price": 660},

    # ── Pest Control ─────────────────────────────────────────────────────────
    {"serviceName": "Pest control",        "serviceCategory": "Pest Control",
     "serviceBasePrice": 750,  "serviceRating": 4.1, "providerRating": 4.2,
     "customerUrgency": 6, "servicePopularity": 55, "price": 840},

    {"serviceName": "Pest control",        "serviceCategory": "Pest Control",
     "serviceBasePrice": 750,  "serviceRating": 4.6, "providerRating": 4.7,
     "customerUrgency": 8, "servicePopularity": 78, "price": 1010},

    # ── Gardening ────────────────────────────────────────────────────────────
    {"serviceName": "Garden maintenance",  "serviceCategory": "Gardening",
     "serviceBasePrice": 550,  "serviceRating": 3.8, "providerRating": 3.9,
     "customerUrgency": 3, "servicePopularity": 35, "price": 490},

    {"serviceName": "Garden maintenance",  "serviceCategory": "Gardening",
     "serviceBasePrice": 550,  "serviceRating": 4.4, "providerRating": 4.5,
     "customerUrgency": 4, "servicePopularity": 58, "price": 610},

    # ── Automotive ───────────────────────────────────────────────────────────
    {"serviceName": "Car wash",            "serviceCategory": "Automotive",
     "serviceBasePrice": 450,  "serviceRating": 3.9, "providerRating": 4.0,
     "customerUrgency": 4, "servicePopularity": 38, "price": 430},

    {"serviceName": "Car wash",            "serviceCategory": "Automotive",
     "serviceBasePrice": 450,  "serviceRating": 4.5, "providerRating": 4.6,
     "customerUrgency": 5, "servicePopularity": 60, "price": 530},
]


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def build_dataset(rows: List[Dict]) -> tuple[pd.DataFrame, pd.Series]:
    records = []
    for row in rows:
        feats  = build_features(row)
        record = {k: feats[k] for k in FEATURE_ORDER}
        record["price"] = float(row["price"])
        records.append(record)
    df = pd.DataFrame(records)
    return df[FEATURE_ORDER], df["price"]


# ---------------------------------------------------------------------------
# Validation helper
# ---------------------------------------------------------------------------

def evaluate(model: Ridge, X: pd.DataFrame, y: pd.Series, label: str = "set") -> None:
    preds = model.predict(X)
    mae   = mean_absolute_error(y, preds)
    rmse  = np.sqrt(mean_squared_error(y, preds))
    r2    = r2_score(y, preds)
    logger.info("[%s] MAE=%.2f | RMSE=%.2f | R²=%.4f", label, mae, rmse, r2)


# ---------------------------------------------------------------------------
# Train
# ---------------------------------------------------------------------------

def train() -> None:
    logger.info("Building feature matrix from %d training samples …", len(TRAINING_DATA))
    X, y = build_dataset(TRAINING_DATA)

    # ── Ridge regression (L2 = 10 works well for small datasets) ─────────
    model = Ridge(alpha=10.0, fit_intercept=True)
    model.fit(X, y)

    # ── Full-data metrics ─────────────────────────────────────────────────
    evaluate(model, X, y, label="train (full)")

    # ── Cross-validation (5-fold) ─────────────────────────────────────────
    kf     = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_r2  = cross_val_score(model, X, y, cv=kf, scoring="r2")
    cv_mae = cross_val_score(model, X, y, cv=kf, scoring="neg_mean_absolute_error")
    logger.info(
        "5-Fold CV  R²=%.4f ± %.4f | MAE=%.2f ± %.2f",
        cv_r2.mean(), cv_r2.std(),
        -cv_mae.mean(), cv_mae.std(),
    )

    # ── Coefficient table ─────────────────────────────────────────────────
    coef_df = pd.DataFrame({
        "feature":     FEATURE_ORDER,
        "coefficient": model.coef_,
    }).sort_values("coefficient", ascending=False)
    logger.info("Feature coefficients:\n%s", coef_df.to_string(index=False))
    logger.info("Intercept: %.4f", model.intercept_)

    # ── Monotonicity check: price must increase with rating ───────────────
    logger.info("Monotonicity check (serviceRating 3.0 → 5.0, all else equal) …")
    probe_base = {
        "serviceName":      "AC repair",
        "serviceCategory":  "Appliance Repair",
        "serviceBasePrice": 1000,
        "providerRating":   4.5,
        "customerUrgency":  6,
        "servicePopularity": 70,
    }
    prev_price = None
    all_monotone = True
    for r in [3.0, 3.5, 4.0, 4.3, 4.5, 4.7, 4.9, 5.0]:
        probe = {**probe_base, "serviceRating": r}
        feats = build_features(probe)
        vec   = np.array([feats[f] for f in FEATURE_ORDER]).reshape(1, -1)
        p     = float(model.predict(vec)[0])
        marker = ""
        if prev_price is not None and p <= prev_price:
            all_monotone = False
            marker = "  ← ⚠️ non-monotone"
        logger.info("  rating=%.1f → ₹%.2f%s", r, p, marker)
        prev_price = p
    if all_monotone:
        logger.info("  ✅ All price predictions are monotone w.r.t. serviceRating.")
    else:
        logger.warning("  ⚠️  Non-monotone steps detected — consider adding more training rows or adjusting alpha.")

    # ── Persist model ─────────────────────────────────────────────────────
    model_data = {
        "model_type":    "Ridge",
        "feature_order": FEATURE_ORDER,
        "coef":          model.coef_.tolist(),
        "intercept":     float(model.intercept_),
        "alpha":         model.alpha,
    }
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pricing_model.pkl")
    with open(output_path, "wb") as fh:
        pickle.dump(model_data, fh, protocol=pickle.HIGHEST_PROTOCOL)
    logger.info("✅  Pricing model saved to %s", output_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    train()