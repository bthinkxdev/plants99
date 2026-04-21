from locust import HttpUser, task, between
import random

PRODUCT_SLUGS = ["dandlions-blue", "dandlion", "room-bamboo", "lucky-bamboo", "hanging-xyz"]
COMBO_SLUGS   = ["air-purifying-indoor-plants-combo-low-care-oxygen-boosters"]
TEST_EMAIL    = "anargh.mv@bthinkx.com"

class ShopUser(HttpUser):
    wait_time = between(1, 3)
    weight = 1  # 1 logged-in user for every 2 guests

    def on_start(self):
        self.client.get("/")
        csrf = self.client.cookies.get("csrftoken")
        self.client.post(
            "/accounts/locust-login/",
            data={"email": TEST_EMAIL},
            headers={"X-CSRFToken": csrf}
        )
        self.client.get("/")

    def _csrf(self):
        return self.client.cookies.get("csrftoken", "")

    @task(3)
    def homepage(self):
        self.client.get("/")

    @task(2)
    def add_to_cart(self):
        self.client.get("/api/cart/drawer/")
        fresh_csrf = self.client.cookies.get("csrftoken")
        with self.client.post(
            "/cart/add/",
            data={"product_id": 5, "variant_id": 1, "quantity": 1},
            headers={
                "X-CSRFToken": fresh_csrf,
                "X-Requested-With": "XMLHttpRequest"
            },
            catch_response=True
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                print(f"Cart fail: {resp.status_code} | {resp.text[:200]}")
                resp.failure(f"{resp.status_code}")

    @task(1)
    def view_cart_drawer(self):
        self.client.get("/api/cart/drawer/")

    @task(1)
    def checkout_page(self):
        self.client.get("/checkout/")

    @task(1)
    def order_history(self):
        self.client.get("/orders/")

    @task(1)
    def wishlist(self):
        self.client.get("/wishlist/")

    @task(2)
    def view_product(self):
        slug = random.choice(PRODUCT_SLUGS)
        self.client.get(f"/products/{slug}/")

    @task(1)
    def view_combo(self):
        slug = random.choice(COMBO_SLUGS)
        self.client.get(f"/combos/{slug}/")


class GuestUser(HttpUser):
    wait_time = between(1, 3)
    weight = 2  # 2 guests for every 1 logged-in user

    def on_start(self):
        self.client.get("/")  # gets csrf cookie, no login

    def _csrf(self):
        return self.client.cookies.get("csrftoken", "")

    @task(3)
    def homepage(self):
        self.client.get("/")

    @task(2)
    def browse_products(self):
        slug = random.choice(PRODUCT_SLUGS)
        self.client.get(f"/products/{slug}/")

    @task(1)
    def view_combo(self):
        slug = random.choice(COMBO_SLUGS)
        self.client.get(f"/combos/{slug}/")

    @task(2)
    def add_to_cart(self):
        fresh_csrf = self.client.cookies.get("csrftoken")
        with self.client.post(
            "/cart/add/",
            data={"product_id": 5, "variant_id": 1, "quantity": 1},
            headers={
                "X-CSRFToken": fresh_csrf,
                "X-Requested-With": "XMLHttpRequest"
            },
            catch_response=True
        ) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                print(f"Guest cart fail: {resp.status_code} | {resp.text[:200]}")
                resp.failure(f"{resp.status_code}")

    @task(1)
    def view_cart_drawer(self):
        self.client.get("/api/cart/drawer/")

    @task(1)
    def checkout(self):
        self.client.get("/checkout/")