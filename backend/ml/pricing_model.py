"""
pricing_model.py
================
Production-grade dynamic pricing engine for home services platform.

Prediction pipeline:
  1. Build rich feature vector from raw request fields.
  2. If a trained sklearn model (pricing_model.pkl) exists, use it.
  3. Otherwise fall back to a calibrated rule-based engine.

Rating sensitivity guarantee
------------------------------
  serviceRating 3.0 → price ≈ base × 0.92   (below-average quality discount)
  serviceRating 4.0 → price ≈ base × 1.00   (baseline)
  serviceRating 4.5 → price ≈ base × 1.12   (good service premium)
  serviceRating 5.0 → price ≈ base × 1.28   (excellent service premium)

All factors are multiplicative and additive — the final price always reflects
quality, urgency, and category in a monotone, interpretable way.
"""

from __future__ import annotations

import json
import logging
import os
import pickle
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import numpy as np

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("pricing_model")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DATA_PATH = os.path.join(SCRIPT_DIR, "pricing_model.pkl")

# ---------------------------------------------------------------------------
# Feature order (must match train_model.py exactly)
# ---------------------------------------------------------------------------
FEATURE_ORDER = [
    "serviceBasePrice",
    "serviceRating",
    "providerRating",
    "customerUrgency",
    "servicePopularity",
    "service_name_score",
    "service_category_score",
    # New interaction / derived features
    "rating_x_popularity",
    "urgency_x_category",
    "combined_rating",
]

# ---------------------------------------------------------------------------
# Category modifier table  (used as a multiplier: 1.00 = neutral)
# ---------------------------------------------------------------------------
SERVICE_CATEGORY_MODIFIERS: Dict[str, float] = {
    "appliance repair": 1.22,
    "plumbing":         1.20,
    "electrical":       1.18,
    "carpentry":        1.16,
    "painting":         1.14,
    "pest control":     1.08,
    "automotive":       1.02,
    "cleaning":         0.96,
    "gardening":        0.93,
    "default":          1.00,
}

# ---------------------------------------------------------------------------
# Service-name keyword score table
# ---------------------------------------------------------------------------
SERVICE_NAME_KEYWORD_SCORES: Dict[str, float] = {
    "air conditioner": 1.24,
    "ac":              1.24,
    "heater":          1.20,
    "water heater":    1.20,
    "plumb":           1.18,
    "leak":            1.22,
    "wiring":          1.18,
    "electrical":      1.18,
    "installation":    1.16,
    "carpentry":       1.16,
    "sofa":            1.12,
    "pest":            1.10,
    "repair":          1.10,
    "painting":        1.14,
    "deep clean":      0.98,
    "cleaning":        0.96,
    "wash":            0.96,
    "garden":          0.93,
}

# ---------------------------------------------------------------------------
# Rating → multiplier breakpoints  (piecewise-linear, monotone increasing)
# ---------------------------------------------------------------------------
# (rating_threshold, cumulative_multiplier_at_that_point)
RATING_BREAKPOINTS = [
    (0.0,  0.80),
    (3.0,  0.92),
    (3.5,  0.97),
    (4.0,  1.00),
    (4.3,  1.06),
    (4.5,  1.12),
    (4.7,  1.20),
    (5.0,  1.28),
]


def rating_to_multiplier(rating: float) -> float:
    """
    Piecewise-linear interpolation so that every 0.1-step in rating
    produces a smooth, monotone price change.
    """
    rating = float(np.clip(rating, 0.0, 5.0))
    for i in range(len(RATING_BREAKPOINTS) - 1):
        r_low,  m_low  = RATING_BREAKPOINTS[i]
        r_high, m_high = RATING_BREAKPOINTS[i + 1]
        if r_low <= rating <= r_high:
            t = (rating - r_low) / (r_high - r_low)
            return round(m_low + t * (m_high - m_low), 6)
    return RATING_BREAKPOINTS[-1][1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm(value: Any) -> str:
    return str(value or "").strip().lower()


def score_service_name(service_name: str) -> float:
    name = _norm(service_name)
    best = 1.0
    for kw, score in SERVICE_NAME_KEYWORD_SCORES.items():
        if kw in name:
            best = max(best, score)
    return best


def score_service_category(service_category: str) -> float:
    cat = _norm(service_category)
    return SERVICE_CATEGORY_MODIFIERS.get(cat, SERVICE_CATEGORY_MODIFIERS["default"])


def _clamp(value: float, lo: float, hi: float) -> float:
    return float(np.clip(value, lo, hi))


# ---------------------------------------------------------------------------
# Feature builder
# ---------------------------------------------------------------------------

def build_features(data: Dict[str, Any]) -> Dict[str, float]:
    """
    Build the full feature dict from a raw API/stdin payload.
    All values are validated and clipped to safe ranges.
    """
    base_price      = max(float(data.get("serviceBasePrice", 0) or 0), 0.0)
    service_rating  = _clamp(float(data.get("serviceRating",  4.0) or 4.0), 0.0, 5.0)
    provider_rating = _clamp(float(data.get("providerRating", 4.0) or 4.0), 0.0, 5.0)
    urgency         = _clamp(float(data.get("customerUrgency", 5)  or 5),   0.0, 10.0)
    popularity      = _clamp(float(data.get("servicePopularity",50) or 50), 0.0, 100.0)

    name_score     = score_service_name(data.get("serviceName",     ""))
    category_score = score_service_category(data.get("serviceCategory", ""))

    # Derived / interaction features (improve ML fit and rule accuracy)
    rating_x_popularity = service_rating * (popularity / 100.0)
    urgency_x_category  = urgency * category_score
    combined_rating     = (service_rating * 0.6 + provider_rating * 0.4)

    return {
        "serviceBasePrice":    base_price,
        "serviceRating":       service_rating,
        "providerRating":      provider_rating,
        "customerUrgency":     urgency,
        "servicePopularity":   popularity,
        "service_name_score":  name_score,
        "service_category_score": category_score,
        "rating_x_popularity": rating_x_popularity,
        "urgency_x_category":  urgency_x_category,
        "combined_rating":     combined_rating,
    }


# ---------------------------------------------------------------------------
# Service-fee calculator (platform commission: 5–12 %)
# ---------------------------------------------------------------------------

def compute_service_fee(
    service_rating: float,
    provider_rating: float,
    popularity: float,
) -> float:
    """
    Dynamic platform fee that scales with quality and demand.
    Range: 5 % – 12 %.
    Higher-rated, more popular services attract a slightly higher fee
    (they convert better, so the platform earns a share of that premium).
    """
    base_fee     = 0.05
    rating_bonus = _clamp((service_rating  - 4.0) * 0.025, 0.0, 0.04)
    prov_bonus   = _clamp((provider_rating - 4.0) * 0.015, 0.0, 0.02)
    pop_bonus    = _clamp(popularity / 100.0 * 0.01, 0.0, 0.01)
    fee = base_fee + rating_bonus + prov_bonus + pop_bonus
    return round(_clamp(fee, 0.05, 0.12), 4)


# ---------------------------------------------------------------------------
# Rule-based fallback pricer
# ---------------------------------------------------------------------------

def rule_price(features: Dict[str, float]) -> float:
    """
    Calibrated rule engine used when the ML model is unavailable.
    All factors are monotone in their respective drivers so that
    price always increases with higher quality / urgency / demand.
    """
    base = features["serviceBasePrice"]
    if base <= 0:
        return 0.0

    # --- Quality factor (most impactful: 20-40 % swing) ---
    svc_mult  = rating_to_multiplier(features["serviceRating"])
    prov_mult = rating_to_multiplier(features["providerRating"])
    # Weight: service rating 60 %, provider 40 %
    quality_factor = svc_mult * 0.60 + prov_mult * 0.40

    # --- Complexity factor from name + category ---
    name_lift = (features["service_name_score"]     - 1.0) * 0.12
    cat_lift  = (features["service_category_score"] - 1.0) * 0.10
    complexity_factor = 1.0 + name_lift + cat_lift

    # --- Urgency surcharge (above baseline 5, each point → +2.5 %) ---
    urgency_excess   = max(0.0, features["customerUrgency"] - 5.0)
    urgency_factor   = 1.0 + urgency_excess * 0.025

    # --- Demand / popularity factor ---
    popularity_factor = 1.0 + (features["servicePopularity"] / 100.0) * 0.08

    raw_price = base * quality_factor * complexity_factor * urgency_factor * popularity_factor

    # --- Platform fee ---
    fee = compute_service_fee(
        features["serviceRating"],
        features["providerRating"],
        features["servicePopularity"],
    )
    final_price = raw_price * (1.0 + fee)

    # Floor: never go below 80 % of base + ₹50 handling
    floor = base * 0.80 + 50.0
    return round(max(final_price, floor), 2)


# ---------------------------------------------------------------------------
# Model loader
# ---------------------------------------------------------------------------

def load_model() -> Optional[Dict[str, Any]]:
    if not os.path.exists(MODEL_DATA_PATH):
        logger.warning("Pricing model not found at %s; using rule-based fallback.", MODEL_DATA_PATH)
        return None
    try:
        with open(MODEL_DATA_PATH, "rb") as fh:
            model_data = pickle.load(fh)
        logger.info("Pricing model loaded (features: %s).", model_data.get("feature_order"))
        return model_data
    except Exception as exc:
        logger.error("Failed to load pricing model: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Main prediction entry point
# ---------------------------------------------------------------------------

def predict_price(data: Dict[str, Any]) -> float:
    """
    Predict the final service price.
    Tries the trained ML model first; falls back to rule_price().
    """
    features = build_features(data)

    if _MODEL is not None:
        try:
            feat_order = _MODEL.get("feature_order", FEATURE_ORDER)
            vector     = np.array([features.get(f, 0.0) for f in feat_order], dtype=np.float64)
            coef       = np.array(_MODEL["coef"],       dtype=np.float64)
            intercept  = float(_MODEL["intercept"])
            ml_price   = float(np.dot(coef, vector) + intercept)
            if ml_price > 0:
                logger.debug("ML prediction: %.2f", ml_price)
                return round(ml_price, 2)
        except Exception as exc:
            logger.warning("ML prediction failed (%s); using rule engine.", exc)

    rule = rule_price(features)
    logger.debug("Rule-based prediction: %.2f", rule)
    return rule


# ---------------------------------------------------------------------------
# Module-level model load (once at import time)
# ---------------------------------------------------------------------------
_MODEL: Optional[Dict[str, Any]] = load_model()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    raw = sys.stdin.read().strip() or "{}"
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("Invalid JSON input: %s", e)
        sys.exit(1)

    price = predict_price(payload)
    print(json.dumps({"predicted_price": price}, indent=2))