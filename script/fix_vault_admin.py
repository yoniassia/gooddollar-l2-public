#!/usr/bin/env python3
"""
fix_vault_admin.py — Step 1 of FixLendingStrategyVault (GOO-324)

Uses anvil_setStorageAt to override the admin slot (slot 7) of each broken
GoodVault from VaultFactory B to the deployer address, so the subsequent
Forge script can call vault.migrateStrategy() as the deployer.

Run BEFORE FixLendingStrategyVault.s.sol Step 2.
"""
import json, urllib.request

RPC = "http://127.0.0.1:8545"
DEPLOYER = "0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266"  # default anvil key 0
ADMIN_SLOT = "0x0000000000000000000000000000000000000000000000000000000000000007"

VAULTS = [
    "0x3b21b7B09dd61e8cd9580ef516b3BBB80E8bf19F",
    "0xe3973b9dAB8212e208612B435fEEad084D71FFF1",
    "0xA38995cFe225BEA5508D379e61099927eA2270c7",
    "0x47627C9aBDdBcdE5f78beE76Ec7Cb8E933c26218",
]

# Deployer address as 32-byte hex (left-padded)
deployer_bytes32 = "0x" + "0" * 24 + DEPLOYER[2:].lower()


def rpc(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, payload)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def get_storage(addr, slot):
    r = rpc("eth_getStorageAt", [addr, slot, "latest"])
    return r.get("result", "")


def set_storage(addr, slot, value):
    r = rpc("anvil_setStorageAt", [addr, slot, value])
    return r


print("=== fix_vault_admin.py — setting vault admin slots to deployer ===")
print(f"Deployer: {DEPLOYER}")
print(f"deployer_bytes32: {deployer_bytes32}")
print()

for i, vault in enumerate(VAULTS):
    before = get_storage(vault, ADMIN_SLOT)
    print(f"vault[{i}] {vault[:12]}...  before admin slot: {before}")
    result = set_storage(vault, ADMIN_SLOT, deployer_bytes32)
    after = get_storage(vault, ADMIN_SLOT)
    print(f"  anvil_setStorageAt result: {result.get('result')}")
    print(f"  after admin slot: {after}")
    expected = deployer_bytes32[2:].lower()
    actual = after[2:].lower() if after.startswith("0x") else after.lower()
    if actual == expected:
        print(f"  [OK] admin slot updated")
    else:
        print(f"  [FAIL] unexpected value: {after}")
        exit(1)
    print()

print("=== All 4 vaults have admin = deployer. Run the Forge migration script next. ===")
