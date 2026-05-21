from django.db import migrations
 
 
STATES = [
    ("Kerala",               "KL", "south",      0),
    ("Tamil Nadu",           "TN", "south",      1),
    ("Karnataka",            "KA", "south",      2),
    ("Andhra Pradesh",       "AP", "south",      3),
    ("Telangana",            "TS", "south",      4),
    ("Goa",                  "GA", "west",       10),
    ("Maharashtra",          "MH", "west",       11),
    ("Gujarat",              "GJ", "west",       12),
    ("Madhya Pradesh",       "MP", "central",    20),
    ("Chhattisgarh",         "CG", "central",    21),
    ("Odisha",               "OD", "east",       30),
    ("West Bengal",          "WB", "east",       31),
    ("Jharkhand",            "JH", "east",       32),
    ("Bihar",                "BR", "east",       33),
    ("Rajasthan",            "RJ", "north",      40),
    ("Uttar Pradesh",        "UP", "north",      41),
    ("Haryana",              "HR", "north",      42),
    ("Delhi",                "DL", "north",      43),
    ("Punjab",               "PB", "north",      44),
    ("Himachal Pradesh",     "HP", "north",      45),
    ("Uttarakhand",          "UK", "north",      46),
    ("Assam",                "AS", "northeast",  50),
    ("Meghalaya",            "ML", "northeast",  51),
    ("Manipur",              "MN", "northeast",  52),
    ("Mizoram",              "MZ", "northeast",  53),
    ("Nagaland",             "NL", "northeast",  54),
    ("Tripura",              "TR", "northeast",  55),
    ("Arunachal Pradesh",    "AR", "northeast",  56),
    ("Sikkim",               "SK", "northeast",  57),
    ("Puducherry",           "PY", "ut",         60),
    ("Andaman & Nicobar",    "AN", "ut",         61),
    ("Lakshadweep",          "LD", "ut",         62),
    ("Chandigarh",           "CH", "ut",         63),
    ("Dadra & Nagar Haveli", "DN", "ut",         64),
    ("Daman & Diu",          "DD", "ut",         65),
    ("Jammu & Kashmir",      "JK", "ut",         66),
    ("Ladakh",               "LA", "ut",         67),
]
 
 
def reseed_states(apps, schema_editor):
    DeliveryState = apps.get_model("app", "DeliveryState")
    for name, code, region, order in STATES:
        obj, created = DeliveryState.objects.get_or_create(
            code=code,
            defaults={
                "name":          name,
                "region":        region,
                "display_order": order,
                "is_active":     True,
            },
        )
        if not created:
            changed = False
            if obj.name != name:
                obj.name = name
                changed = True
            if obj.region != region:
                obj.region = region
                changed = True
            if obj.display_order != order:
                obj.display_order = order
                changed = True
            if not obj.is_active:
                obj.is_active = True
                changed = True
            if changed:
                obj.save(update_fields=["name", "region", "display_order", "is_active"])
 
 
def noop(apps, schema_editor):
    pass
 
 
class Migration(migrations.Migration):
 
    dependencies = [
        ("app", "0005_rename_app_productpotaddon_plant_order_idx_app_product_plant_p_e66b68_idx_and_more"),
    ]
 
    operations = [
        migrations.RunPython(reseed_states, reverse_code=noop),
    ]
 