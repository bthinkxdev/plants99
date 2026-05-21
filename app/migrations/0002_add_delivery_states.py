"""
Migration: Add DeliveryState + ProductDeliveryState tables.
Includes seed data for all 28 Indian states and 8 Union Territories.

USAGE:
  1. Replace "XXXX_previous_migration" below with your actual last migration name.
  2. python manage.py migrate app
  3. Verify: python manage.py shell -c \
        "from app.models import DeliveryState; print(DeliveryState.objects.count())"
     → Should print 36
"""

import django.db.models.deletion
from django.db import migrations, models


# ── Seed rows ──────────────────────────────────────────────────────────────────
# Format: (name, code, region, display_order)
# Ordered South → West → Central → East → North → NE → UTs
# so the customer dropdown naturally goes from nearby to farther states.

STATES_SEED = [
    # ── South India (seller is in Kerala; nearby states come first) ────────────
    ("Kerala",                "KL",   "south",      0),
    ("Tamil Nadu",            "TN",   "south",      1),
    ("Karnataka",             "KA",   "south",      2),
    ("Andhra Pradesh",        "AP",   "south",      3),
    ("Telangana",             "TS",   "south",      4),
    # ── West India ─────────────────────────────────────────────────────────────
    ("Goa",                   "GA",   "west",      10),
    ("Maharashtra",           "MH",   "west",      11),
    ("Gujarat",               "GJ",   "west",      12),
    # ── Central India ──────────────────────────────────────────────────────────
    ("Madhya Pradesh",        "MP",   "central",   20),
    ("Chhattisgarh",          "CG",   "central",   21),
    # ── East India ─────────────────────────────────────────────────────────────
    ("Odisha",                "OD",   "east",      30),
    ("West Bengal",           "WB",   "east",      31),
    ("Jharkhand",             "JH",   "east",      32),
    ("Bihar",                 "BR",   "east",      33),
    # ── North India ────────────────────────────────────────────────────────────
    ("Rajasthan",             "RJ",   "north",     40),
    ("Uttar Pradesh",         "UP",   "north",     41),
    ("Haryana",               "HR",   "north",     42),
    ("Delhi",                 "DL",   "north",     43),
    ("Punjab",                "PB",   "north",     44),
    ("Himachal Pradesh",      "HP",   "north",     45),
    ("Uttarakhand",           "UK",   "north",     46),
    # ── North-East India ───────────────────────────────────────────────────────
    ("Assam",                 "AS",   "northeast", 50),
    ("Meghalaya",             "ML",   "northeast", 51),
    ("Manipur",               "MN",   "northeast", 52),
    ("Mizoram",               "MZ",   "northeast", 53),
    ("Nagaland",              "NL",   "northeast", 54),
    ("Tripura",               "TR",   "northeast", 55),
    ("Arunachal Pradesh",     "AR",   "northeast", 56),
    ("Sikkim",                "SK",   "northeast", 57),
    # ── Union Territories ──────────────────────────────────────────────────────
    ("Puducherry",            "PY",   "ut",        60),
    ("Andaman & Nicobar",     "AN",   "ut",        61),
    ("Lakshadweep",           "LD",   "ut",        62),
    ("Chandigarh",            "CH",   "ut",        63),
    ("Dadra & Nagar Haveli",  "DN",   "ut",        64),
    ("Daman & Diu",           "DD",   "ut",        65),
    ("Jammu & Kashmir",       "JK",   "ut",        66),
    ("Ladakh",                "LA",   "ut",        67),
]


def seed_delivery_states(apps, schema_editor):
    DeliveryState = apps.get_model("app", "DeliveryState")
    for name, code, region, order in STATES_SEED:
        DeliveryState.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "region": region,
                "display_order": order,
                "is_active": True,
            },
        )


def unseed_delivery_states(apps, schema_editor):
    """Reverse: only delete states that have no product delivery assignments."""
    DeliveryState = apps.get_model("app", "DeliveryState")
    ProductDeliveryState = apps.get_model("app", "ProductDeliveryState")
    used_ids = set(ProductDeliveryState.objects.values_list("state_id", flat=True))
    DeliveryState.objects.exclude(pk__in=used_ids).delete()


class Migration(migrations.Migration):

    dependencies = [
        # ── REPLACE THIS with your actual last migration ──────────────────────
        ("app", "0001_initial"),
    ]

    operations = [

        # ── 1. DeliveryState master table ─────────────────────────────────────
        migrations.CreateModel(
            name="DeliveryState",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True, primary_key=True, serialize=False
                    ),
                ),
                ("name", models.CharField(max_length=80, unique=True)),
                (
                    "code",
                    models.CharField(
                        help_text="ISO 3166-2:IN short code — e.g. KL, TN, MH",
                        max_length=4,
                        unique=True,
                    ),
                ),
                (
                    "region",
                    models.CharField(
                        choices=[
                            ("south",     "South India"),
                            ("west",      "West India"),
                            ("north",     "North India"),
                            ("east",      "East India"),
                            ("northeast", "North-East India"),
                            ("central",   "Central India"),
                            ("ut",        "Union Territory"),
                        ],
                        db_index=True,
                        max_length=20,
                    ),
                ),
                (
                    "display_order",
                    models.PositiveSmallIntegerField(default=0),
                ),
                (
                    "is_active",
                    models.BooleanField(db_index=True, default=True),
                ),
            ],
            options={
                "verbose_name": "Delivery State",
                "verbose_name_plural": "Delivery States",
                "ordering": ["display_order", "name"],
            },
        ),

        # ── 2. ProductDeliveryState bridge table ──────────────────────────────
        migrations.CreateModel(
            name="ProductDeliveryState",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True, primary_key=True, serialize=False
                    ),
                ),
                ("added_at", models.DateTimeField(auto_now_add=True)),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="delivery_states",
                        to="app.product",
                    ),
                ),
                (
                    "state",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="product_deliveries",
                        to="app.deliverystate",
                    ),
                ),
            ],
            options={
                "verbose_name": "Product Delivery State",
                "verbose_name_plural": "Product Delivery States",
                "ordering": ["state__display_order", "state__name"],
            },
        ),

        # ── 3. Unique constraint on bridge table ──────────────────────────────
        migrations.AlterUniqueTogether(
            name="productdeliverystate",
            unique_together={("product", "state")},
        ),

        # ── 4. Add delivery_state FK to Address model ─────────────────────────
        migrations.AddField(
            model_name="address",
            name="delivery_state",
            field=models.ForeignKey(
                blank=True,
                help_text="Structured delivery state selected at checkout.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="addresses",
                to="app.deliverystate",
            ),
        ),

        # ── 5. Seed all 36 states/UTs ─────────────────────────────────────────
        migrations.RunPython(seed_delivery_states, reverse_code=unseed_delivery_states),
    ]