// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/yield/GoodVault.sol";
import "../src/yield/VaultFactory.sol";
import "../src/yield/strategies/LendingStrategy.sol";
import "../src/yield/strategies/StablecoinStrategy.sol";

/**
 * @title DeployInitialVaults — Deploy 3 initial GoodYield vaults via VaultFactory
 * @notice Creates:
 *   1. ETH-Lending vault  — deposits WETH into GoodLend, earns supply APY
 *   2. gUSD-Stability vault — deposits gUSD into StabilityPool, earns liquidation gains
 *   3. G$-Lending vault   — deposits G$ into GoodLend, earns supply APY
 *
 * Each strategy is deployed standalone (the chicken-and-egg problem: strategy needs vault,
 * vault needs strategy) so we deploy strategies first with a temporary vault, then create
 * vaults via factory, then wire the strategies to their vaults.
 *
 * Run: forge script script/DeployInitialVaults.s.sol --broadcast --rpc-url http://localhost:8545
 */

interface IMintable {
    function mint(address to, uint256 amount) external;
}

contract DeployInitialVaults is Script {
    // ─── Addresses — read from env, fall back to previous devnet defaults ───
    // On a fresh Kurtosis deploy, set these env vars from earlier deploy output.
    // The kurtosis-deploy.sh script does this automatically.

    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(pk);

        address VAULT_FACTORY  = vm.envOr("VAULT_FACTORY",  address(0xe70f935c32dA4dB13e7876795f1e175465e6458e));
        address UBI_FEE        = vm.envOr("UBI_FEE",        address(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512));
        address GOOD_LEND_POOL = vm.envOr("GOOD_LEND_POOL", address(0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff));
        address WETH           = vm.envOr("WETH",           address(0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d));
        address USDC           = vm.envOr("USDC",           address(0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5));
        address GD_TOKEN       = vm.envOr("GOOD_DOLLAR_TOKEN", address(0x36C02dA8a0983159322a80FFE9F24b1acfF8B570));
        address G_TOKEN_WETH   = vm.envOr("G_TOKEN_WETH",   address(0xA4899D35897033b927acFCf422bc745916139776));
        address G_TOKEN_USDC   = vm.envOr("G_TOKEN_USDC",   address(0x4631BCAbD6dF18D94796344963cB60d44a4136b6));
        address GUSD           = vm.envOr("GUSD",           address(0x5D42EBdBBa61412295D7b0302d6F50aC449Ddb4F));
        address STABILITY_POOL = vm.envOr("STABILITY_POOL", address(0xAD523115cd35a8d4E60B3C0953E0E0ac10418309));

        vm.startBroadcast(pk);

        VaultFactory factory = VaultFactory(VAULT_FACTORY);

        // ════════════════════════════════════════════════════════
        // 1. ETH-Lending Vault — WETH → GoodLend
        // ════════════════════════════════════════════════════════

        // Deploy a mock GoodLend-compatible gToken for G$ (we already have gWETH)
        // Deploy LendingStrategy for WETH
        LendingStrategy ethStrategy = new LendingStrategy(
            WETH,
            GOOD_LEND_POOL,
            G_TOKEN_WETH,
            address(0) // temp vault — will update
        );
        console.log("ETH LendingStrategy:", address(ethStrategy));

        // Approve strategy in factory
        factory.approveStrategy(address(ethStrategy));

        // Create vault via factory
        address ethVault = factory.createVault(
            WETH,
            address(ethStrategy),
            "GoodVault ETH-Lending",
            "gvETH",
            500 ether // 500 ETH cap
        );
        console.log("ETH-Lending Vault:", ethVault);

        // Wire strategy → vault (chicken-and-egg fix: setVault is one-shot, only works when vault==address(0))
        ethStrategy.setVault(ethVault);

        // ════════════════════════════════════════════════════════
        // 2. gUSD-Stability Vault — gUSD → StabilityPool
        // ════════════════════════════════════════════════════════

        // Use real StabilityPool (GOO-376: updated from MockStabilityPool to real SP)
        StablecoinStrategy gusdStrategy = new StablecoinStrategy(
            GUSD,
            STABILITY_POOL,
            WETH, // gain token (ETH from liquidations, claimed off-band via claimCollateral)
            address(0) // temp vault
        );
        console.log("gUSD StablecoinStrategy (real SP):", address(gusdStrategy));

        factory.approveStrategy(address(gusdStrategy));

        address gusdVault = factory.createVault(
            GUSD,
            address(gusdStrategy),
            "GoodVault gUSD-Stability",
            "gvgUSD",
            1_000_000 ether // 1M gUSD cap
        );
        console.log("gUSD-Stability Vault:", gusdVault);

        gusdStrategy.setVault(gusdVault);

        // ════════════════════════════════════════════════════════
        // 3. G$-Lending Vault — G$ → GoodLend
        // ════════════════════════════════════════════════════════

        // Deploy a mock gToken for G$ (GoodLend doesn't have G$ market yet — create mock)
        MockGToken gTokenGD = new MockGToken(GD_TOKEN, "gToken GD", "gGD");
        console.log("Mock gToken GD:", address(gTokenGD));

        // Deploy a mock lending pool adapter for G$
        MockLendPool gdLendPool = new MockLendPool(GD_TOKEN, address(gTokenGD));
        console.log("Mock GD LendPool:", address(gdLendPool));

        LendingStrategy gdStrategy = new LendingStrategy(
            GD_TOKEN,
            address(gdLendPool),
            address(gTokenGD),
            address(0) // temp vault
        );
        console.log("G$ LendingStrategy:", address(gdStrategy));

        factory.approveStrategy(address(gdStrategy));

        address gdVault = factory.createVault(
            GD_TOKEN,
            address(gdStrategy),
            "GoodVault G$-Lending",
            "gvGD",
            10_000_000 ether // 10M G$ cap
        );
        console.log("G$-Lending Vault:", gdVault);

        gdStrategy.setVault(gdVault);

        // ════════════════════════════════════════════════════════
        // Summary
        // ════════════════════════════════════════════════════════

        uint256 vaultCount = factory.vaultCount();
        console.log("--- VaultFactory Summary ---");
        console.log("VaultFactory total vaults:", vaultCount);
        console.log("  1. ETH-Lending  :", ethVault);
        console.log("  2. gUSD-Stability:", gusdVault);
        console.log("  3. G$-Lending   :", gdVault);
        console.log("----------------------------");

        vm.stopBroadcast();
    }
}

// ─── Mock Contracts for Devnet ──────────────────────────────────────────────

/**
 * @notice Simple mock StabilityPool that holds gUSD deposits
 *         Used for devnet demo — tracks deposits per user
 */
contract MockStabilityPool {
    IERC20 public asset;
    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;

    constructor(address _asset) {
        asset = IERC20(_asset);
    }

    function deposit(uint256 amount) external {
        asset.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        totalDeposits += amount;
    }

    function withdraw(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "insufficient");
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        asset.transfer(msg.sender, amount);
    }

    function getDepositorBalance(address depositor) external view returns (uint256) {
        return deposits[depositor];
    }

    function getDepositorGain(address) external pure returns (uint256) {
        return 0; // No gains in mock
    }

    function claimGains() external pure returns (uint256) {
        return 0;
    }
}

/**
 * @notice Mock gToken (interest-bearing receipt) for assets not yet in GoodLend
 */
contract MockGToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    address public underlying;
    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    constructor(address _underlying, string memory _name, string memory _symbol) {
        underlying = _underlying;
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "insufficient");
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function scaledBalanceOf(address user) external view returns (uint256) {
        return balanceOf[user];
    }
}

/**
 * @notice Mock lending pool adapter for G$ — wraps deposits into mock gToken
 */
contract MockLendPool {
    address public asset;
    MockGToken public gToken;

    constructor(address _asset, address _gToken) {
        asset = _asset;
        gToken = MockGToken(_gToken);
    }

    function supply(address _asset, uint256 amount, address onBehalfOf) external {
        require(_asset == asset, "wrong asset");
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        gToken.mint(onBehalfOf, amount);
    }

    function withdraw(address _asset, uint256 amount, address to) external returns (uint256) {
        require(_asset == asset, "wrong asset");
        gToken.burn(msg.sender, amount);
        IERC20(asset).transfer(to, amount);
        return amount;
    }

    function getReserveData(address) external view returns (
        uint256, uint256, uint256, uint256, uint256, uint256,
        address, address, address, uint256, bool, bool, uint256
    ) {
        return (0, 0, 0, 0, 0, 0, address(gToken), address(0), address(0), 0, true, false, 0);
    }
}
