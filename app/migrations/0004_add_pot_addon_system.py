"""
Migration: 0XXX_add_pot_addon_system.py

Place this in your app/migrations/ folder.
Name it after your latest migration, e.g. if latest is 0047_xxx, name this 0048_add_pot_addon_system.py
Replace `app` with your actual app name if different.
Replace `0047_previous` with your actual latest migration name.
"""

from decimal import Decimal
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        
        ('app', '0003_remove_address_delivery_state_and_more'),
    ]

    operations = [

        # ── 1. ProductPotAddon table ───────────────────────────────────────────
        migrations.CreateModel(
            name='ProductPotAddon',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('display_order', models.PositiveIntegerField(db_index=True, default=0)),
                ('plant_product', models.ForeignKey(
                    help_text='The plant product this addon belongs to.',
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='pot_addons',
                    to='app.product',
                )),
                ('pot_product', models.ForeignKey(
                    help_text='The pot product available as an add-on.',
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='linked_as_pot_addon',
                    to='app.product',
                )),
            ],
            options={
                'ordering': ['display_order', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='productpotaddon',
            constraint=models.UniqueConstraint(
                fields=['plant_product', 'pot_product'],
                name='uniq_plant_pot_addon',
            ),
        ),
        migrations.AddIndex(
            model_name='productpotaddon',
            index=models.Index(fields=['plant_product', 'display_order'], name='app_productpotaddon_plant_order_idx'),
        ),

        # ── 2. CartItem: add selected_pot + pot_unit_price ────────────────────
        migrations.AddField(
            model_name='cartitem',
            name='selected_pot',
            field=models.ForeignKey(
                blank=True,
                help_text='Optional pot product added alongside this plant.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='cart_items_as_pot',
                to='app.product',
            ),
        ),
        migrations.AddField(
            model_name='cartitem',
            name='pot_unit_price',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Snapshot of pot price at time of adding to cart.',
                max_digits=10,
                null=True,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),

        # ── 3. Drop old unique constraints (they don't include selected_pot) ──
        migrations.RemoveConstraint(
            model_name='cartitem',
            name='uniq_cart_variant_line',
        ),
        migrations.RemoveConstraint(
            model_name='cartitem',
            name='uniq_cart_simple_line',
        ),

        # ── 4. Re-add constraints WITH selected_pot ───────────────────────────
        migrations.AddConstraint(
            model_name='cartitem',
            constraint=models.UniqueConstraint(
                condition=models.Q(selected_variant__isnull=False),
                fields=['cart', 'selected_variant', 'line_type', 'rental_key', 'is_gift', 'selected_pot'],
                name='uniq_cart_variant_line',
            ),
        ),
        migrations.AddConstraint(
            model_name='cartitem',
            constraint=models.UniqueConstraint(
                condition=models.Q(selected_variant__isnull=True, combo__isnull=True),
                fields=['cart', 'product', 'line_type', 'rental_key', 'is_gift', 'selected_pot'],
                name='uniq_cart_simple_line',
            ),
        ),

        # ── 5. OrderItem: add pot snapshot fields ─────────────────────────────
        migrations.AddField(
            model_name='orderitem',
            name='selected_pot_name',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Snapshot of pot product name at time of order.',
                max_length=200,
            ),
        ),
        migrations.AddField(
            model_name='orderitem',
            name='pot_unit_price',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Snapshot of pot price at time of order.',
                max_digits=10,
                null=True,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
    ]