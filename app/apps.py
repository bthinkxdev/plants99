import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class AppConfig(AppConfig):
    name = "app"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        try:
            self._seed_delivery_states()
        except Exception as exc:
            # Never crash the server over seeding — just log and continue.
            logger.error("[startup] DeliveryState seed failed: %s", exc, exc_info=True)

    # ── private ────────────────────────────────────────────────────────────────

    def _seed_delivery_states(self):
        """
        Idempotent seed: uses get_or_create so re-running is always safe.
        Runs on every Django startup, guaranteeing data exists in every
        environment (SQLite local, PostgreSQL production, CI, staging, etc.)
        without needing console access or manual migration runs.
        """
        from django.db import connection

        table_names = connection.introspection.table_names()
        if "app_deliverystate" not in table_names:
            logger.info("[startup] app_deliverystate table not found — skipping seed.")
            return

        from app.models import DeliveryState

        STATES = [
            # (name, code, region, display_order)
            # ── South India ────────────────────────────────────────────────────
            ("Kerala",               "KL", "south",      0),
            ("Tamil Nadu",           "TN", "south",      1),
            ("Karnataka",            "KA", "south",      2),
            ("Andhra Pradesh",       "AP", "south",      3),
            ("Telangana",            "TS", "south",      4),
            # ── West India ────────────────────────────────────────────────────
            ("Goa",                  "GA", "west",      10),
            ("Maharashtra",          "MH", "west",      11),
            ("Gujarat",              "GJ", "west",      12),
            # ── Central India ─────────────────────────────────────────────────
            ("Madhya Pradesh",       "MP", "central",   20),
            ("Chhattisgarh",         "CG", "central",   21),
            # ── East India ────────────────────────────────────────────────────
            ("Odisha",               "OD", "east",      30),
            ("West Bengal",          "WB", "east",      31),
            ("Jharkhand",            "JH", "east",      32),
            ("Bihar",                "BR", "east",      33),
            # ── North India ───────────────────────────────────────────────────
            ("Rajasthan",            "RJ", "north",     40),
            ("Uttar Pradesh",        "UP", "north",     41),
            ("Haryana",              "HR", "north",     42),
            ("Delhi",                "DL", "north",     43),
            ("Punjab",               "PB", "north",     44),
            ("Himachal Pradesh",     "HP", "north",     45),
            ("Uttarakhand",          "UK", "north",     46),
            # ── North-East India ──────────────────────────────────────────────
            ("Assam",                "AS", "northeast", 50),
            ("Meghalaya",            "ML", "northeast", 51),
            ("Manipur",              "MN", "northeast", 52),
            ("Mizoram",              "MZ", "northeast", 53),
            ("Nagaland",             "NL", "northeast", 54),
            ("Tripura",              "TR", "northeast", 55),
            ("Arunachal Pradesh",    "AR", "northeast", 56),
            ("Sikkim",               "SK", "northeast", 57),
            # ── Union Territories ─────────────────────────────────────────────
            ("Puducherry",           "PY", "ut",        60),
            ("Andaman & Nicobar",    "AN", "ut",        61),
            ("Lakshadweep",          "LD", "ut",        62),
            ("Chandigarh",           "CH", "ut",        63),
            ("Dadra & Nagar Haveli", "DN", "ut",        64),
            ("Daman & Diu",          "DD", "ut",        65),
            ("Jammu & Kashmir",      "JK", "ut",        66),
            ("Ladakh",               "LA", "ut",        67),
        ]

        created_count = 0
        for name, code, region, order in STATES:
            _, created = DeliveryState.objects.get_or_create(
                code=code,
                defaults={
                    "name":          name,
                    "region":        region,
                    "display_order": order,
                    "is_active":     True,
                },
            )
            if created:
                created_count += 1

        if created_count:
            logger.info("[startup] DeliveryState: seeded %d missing states.", created_count)
        else:
            logger.debug("[startup] DeliveryState: all 36 states already present.")