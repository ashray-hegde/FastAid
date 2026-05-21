"""
tip_model.py
============
Production-grade tip recommendation engine for home services platform.

Tip sensitivity guarantee
--------------------------
  serviceRating 3.0  →  tip ≈  6 % of base amount  (poor service)
  serviceRating 3.5  →  tip ≈  8 %
  serviceRating 4.0  →  tip ≈ 10 %
  serviceRating 4.3  →  tip ≈ 12 %
  serviceRating 4.7  →  tip ≈ 14 %
  serviceRating 5.0  →  tip ≈ 18 %   (exceptional service)

Additional modifiers (additive, each capped independently):
  • High urgency (≥ 8/10)          → +2 pp
  • Moderate urgency (6–7.9/10)    → +1 pp
  • Cash payment                   → +2 pp  (encourage digital, show cash benefit)
  • High bill amount (> ₹1 500)    → +1 pp  (reward on larger jobs)
  • Combo: high rating + urgency   → extra +1 pp  (interaction bonus)

Total tip % is hard-clamped to [5 %, 22 %].
"""

from __future__ import annotations

import json
import logging
import sys
from typing import Optional

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("tip_model")

# ---------------------------------------------------------------------------
# Rating → base tip percentage (piecewise-linear, strictly monotone)
# ---------------------------------------------------------------------------
# (rating_threshold, tip_percentage_at_that_point)
TIP_BREAKPOINTS = [
    (0.0,  0.04),
    (3.0,  0.06),
    (3.5,  0.08),
    (4.0,  0.10),
    (4.3,  0.12),
    (4.5,  0.13),
    (4.7,  0.14),
    (4.9,  0.16),
    (5.0,  0.18),
]

TIP_MIN = 0.05   # 5  %
TIP_MAX = 0.22   # 22 %


def _rating_to_base_tip(rating: float) -> float:
    """
    Piecewise-linear interpolation over TIP_BREAKPOINTS.
    Guarantees strict monotone increase with rating.
    """
    rating = max(0.0, min(5.0, float(rating)))
    for i in range(len(TIP_BREAKPOINTS) - 1):
        r_low,  t_low  = TIP_BREAKPOINTS[i]
        r_high, t_high = TIP_BREAKPOINTS[i + 1]
        if r_low <= rating <= r_high:
            t = (rating - r_low) / (r_high - r_low)
            return round(t_low + t * (t_high - t_low), 6)
    return TIP_BREAKPOINTS[-1][1]


# ---------------------------------------------------------------------------
# Core recommendation function
# ---------------------------------------------------------------------------

def recommend_tip(
    base_amount:    float,
    service_rating: float,
    payment_method: Optional[str] = "card",
    urgency_score:  float = 5.0,
) -> float:
    """
    Compute a recommended tip amount (in currency units).

    Parameters
    ----------
    base_amount    : Billed amount before tip.
    service_rating : Rated quality of the service (0–5).
    payment_method : 'cash' | 'card' | 'upi' | etc.
    urgency_score  : Customer urgency at time of booking (0–10).

    Returns
    -------
    Recommended tip amount, rounded to 2 decimal places.
    """
    base_amount    = max(0.0, float(base_amount or 0))
    service_rating = max(0.0, min(5.0, float(service_rating or 3.0)))
    urgency_score  = max(0.0, min(10.0, float(urgency_score or 5.0)))
    payment_method = (payment_method or "card").strip().lower()

    if base_amount <= 0:
        return 0.0

    # 1. Base tip from rating (piecewise-linear, monotone)
    tip_pct = _rating_to_base_tip(service_rating)

    # 2. Urgency modifier
    if urgency_score >= 8.0:
        tip_pct += 0.02
    elif urgency_score >= 6.0:
        tip_pct += 0.01

    # 3. Payment method modifier (cash payers get a small extra suggestion
    #    because cash workers don't benefit from platform bonuses)
    if payment_method == "cash":
        tip_pct += 0.02

    # 4. Large-bill modifier (bigger job → slightly higher tip encouragement)
    if base_amount > 1500:
        tip_pct += 0.01

    # 5. Combination bonus: excellent rating + high urgency
    if service_rating >= 4.7 and urgency_score >= 8.0:
        tip_pct += 0.01

    # Clamp
    tip_pct = round(max(TIP_MIN, min(TIP_MAX, tip_pct)), 4)

    tip_amount = round(base_amount * tip_pct, 2)

    logger.debug(
        "tip_pct=%.2f%% | base=%.2f | rating=%.1f | urgency=%.1f | method=%s → tip=%.2f",
        tip_pct * 100, base_amount, service_rating, urgency_score, payment_method, tip_amount,
    )
    return tip_amount


# ---------------------------------------------------------------------------
# Tiered label for UI display
# ---------------------------------------------------------------------------

def tip_label(service_rating: float) -> str:
    """Return a human-readable tier label for UI tooltips."""
    if service_rating >= 4.7:
        return "Exceptional — Highly Recommended"
    if service_rating >= 4.3:
        return "Great Service — Tip Appreciated"
    if service_rating >= 4.0:
        return "Good Service"
    if service_rating >= 3.5:
        return "Average — Optional Tip"
    return "Below Average — Tip Discretionary"


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    raw = sys.stdin.read().strip() or "{}"
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Invalid JSON input: %s", exc)
        sys.exit(1)

    base_amount    = float(payload.get("baseAmount",    0))
    service_rating = float(payload.get("serviceRating", 4.0))
    payment_method = str(payload.get("paymentMethod",  "card"))
    urgency_score  = float(payload.get("urgencyScore",  5.0))

    tip = recommend_tip(base_amount, service_rating, payment_method, urgency_score)
    label = tip_label(service_rating)

    print(json.dumps({
        "recommendedTip":    tip,
        "tipLabel":          label,
        "tipPercentage":     round(tip / base_amount * 100, 2) if base_amount > 0 else 0,
    }, indent=2))


if __name__ == "__main__":
    main()