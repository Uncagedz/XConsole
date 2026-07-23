# Dealership website connector

This connector calls the preserved FastAPI inventory sync/active endpoints and normalizes
records primarily by VIN. Fixture mode uses generated synthetic inventory. Live network
behavior must be configured with an authorized dealership inventory URL.
