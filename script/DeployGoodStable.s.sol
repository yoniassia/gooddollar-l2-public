// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stable/gUSD.sol";
import "../src/stable/CollateralRegistry.sol";
import "../src/stable/VaultManager.sol";
import "../src/stable/StabilityPool.sol";
import "../src/stable/PegStabilityModule.sol";

/**
 * @title DeployGoodStable
 * @notice Deploys the full GoodStable (gUSD) stablecoin protocol on GoodDollar L2 devnet.
 *
 *         Deploys:
 *           1. Mock collateral tokens (WETH, USDC, G$)
 *           2. Mock price oracle
 *           3. Mock UBI fee splitter
 *           4. gUSD token
 *           5. CollateralRegistry (ETH, G$, USDC ilks)
 *           6. VaultManager (CDP engine)
 *           7. StabilityPool (liquidation backstop)
 *           8. PegStabilityModule (USDC ↔ gUSD)
 *           9. Wire permissions + seed liquidity
 */
contract DeployGoodStable is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ─── 1. Deploy mock collateral tokens ───
        MockWETH18 weth    = new MockWETH18();
        MockUSDC6  usdc    = new MockUSDC6();
        MockGD18   gdToken = new MockGD18();

        console.log("MockWETH deployed:", address(weth));
        console.log("MockUSDC deployed:", address(usdc));
        console.log("MockG$   deployed:", address(gdToken));

        // ─── 2. Deploy mock oracle ───
        MockPriceOracle oracle = new MockPriceOracle();
        oracle.setPrice(bytes32("ETH"),  2000e18);  // $2,000
        oracle.setPrice(bytes32("GD"),   1e15);      // $0.001
        oracle.setPrice(bytes32("USDC"), 1e18);      // $1.00
        console.log("MockPriceOracle deployed:", address(oracle));

        // ─── 3. Deploy gUSD token ───
        gUSD gusd = new gUSD(deployer);
        console.log("gUSD deployed:", address(gusd));

        // ─── 4. Deploy mock fee splitter ───
        MockUBIFeeSplitter feeSplitter = new MockUBIFeeSplitter(address(gusd));
        console.log("MockUBIFeeSplitter deployed:", address(feeSplitter));

        // ─── 5. Deploy CollateralRegistry ───
        CollateralRegistry registry = new CollateralRegistry(
            deployer,
            address(weth),
            address(gdToken),
            address(usdc)
        );
        console.log("CollateralRegistry deployed:", address(registry));

        // ─── 6. Deploy VaultManager ───
        VaultManager vault = new VaultManager(
            address(gusd),
            address(registry),
            address(oracle),
            address(feeSplitter),
            deployer,  // dAppRecipient (treasury)
            deployer   // admin
        );
        console.log("VaultManager deployed:", address(vault));

        // ─── 7. Deploy StabilityPool ───
        StabilityPool sp = new StabilityPool(address(gusd), deployer);
        sp.setVaultManager(address(vault));
        sp.registerCollateralToken(bytes32("ETH"),  address(weth));
        sp.registerCollateralToken(bytes32("GD"),   address(gdToken));
        sp.registerCollateralToken(bytes32("USDC"), address(usdc));
        console.log("StabilityPool deployed:", address(sp));

        // ─── 8. Deploy PegStabilityModule ───
        PegStabilityModule psm = new PegStabilityModule(
            address(gusd),
            address(usdc),
            address(feeSplitter),
            deployer
        );
        console.log("PegStabilityModule deployed:", address(psm));

        // ─── 9. Wire permissions ───
        // Authorize VaultManager and PSM as gUSD minters
        gusd.setMinter(address(vault), true);
        gusd.setMinter(address(psm),   true);

        // Authorize VaultManager, PSM, and SP as gUSD burners
        gusd.setBurner(address(vault), true);
        gusd.setBurner(address(psm),   true);
        gusd.setBurner(address(sp),    true);

        // Wire StabilityPool into VaultManager
        vault.setStabilityPool(address(sp));

        // ─── 10. Seed liquidity ───
        // Mint tokens to deployer
        weth.mint(deployer, 100 ether);
        usdc.mint(deployer, 1_000_000e6);
        gdToken.mint(deployer, 100_000_000e18);

        // Open a demo ETH vault: deposit 10 ETH, mint 5000 gUSD
        weth.approve(address(vault), 10 ether);
        vault.depositCollateral(bytes32("ETH"), 10 ether);
        vault.mintGUSD(bytes32("ETH"), 5000e18);

        // Seed PSM with USDC
        usdc.approve(address(psm), 100_000e6);
        psm.swapUSDCForGUSD(100_000e6);

        // Seed StabilityPool with 2000 gUSD
        gusd.approve(address(sp), 2000e18);
        sp.deposit(2000e18);

        console.log("");
        console.log("=== GoodStable Deployment Complete ===");
        console.log("gUSD:              ", address(gusd));
        console.log("VaultManager:      ", address(vault));
        console.log("CollateralRegistry:", address(registry));
        console.log("StabilityPool:     ", address(sp));
        console.log("PSM:               ", address(psm));
        console.log("PriceOracle:       ", address(oracle));
        console.log("FeeSplitter:       ", address(feeSplitter));
        console.log("");
        console.log("Collateral tokens:");
        console.log("  WETH:", address(weth));
        console.log("  USDC:", address(usdc));
        console.log("  G$:  ", address(gdToken));
        console.log("");
        console.log("Seed state:");
        console.log("  ETH vault: 10 ETH collateral, 5000 gUSD debt");
        console.log("  PSM: 100K USDC reserves");
        console.log("  StabilityPool: 2000 gUSD deposited");

        vm.stopBroadcast();
    }
}

// ─── Mock tokens for devnet ───

contract MockWETH18 {
    string public constant name = "Wrapped Ether";
    string public constant symbol = "WETH";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount; balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount); return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) { require(a >= amount, "allowance"); allowance[from][msg.sender] = a - amount; }
        require(balanceOf[from] >= amount, "insufficient");
        balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount); return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount); return true;
    }
}

contract MockUSDC6 {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount; balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount); return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) { require(a >= amount, "allowance"); allowance[from][msg.sender] = a - amount; }
        require(balanceOf[from] >= amount, "insufficient");
        balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount); return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount); return true;
    }
}

contract MockGD18 {
    string public constant name = "GoodDollar";
    string public constant symbol = "G$";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount; balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount); return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) { require(a >= amount, "allowance"); allowance[from][msg.sender] = a - amount; }
        require(balanceOf[from] >= amount, "insufficient");
        balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount); return true;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount); return true;
    }
}

// ─── Mock oracle & fee splitter ───

contract MockPriceOracle {
    mapping(bytes32 => uint256) public prices;
    function setPrice(bytes32 ilk, uint256 price) external { prices[ilk] = price; }
    function getPrice(bytes32 ilk) external view returns (uint256) { return prices[ilk]; }
}

contract MockUBIFeeSplitter {
    address public immutable token;
    uint256 public totalReceived;
    uint256 public ubiReceived;

    constructor(address _token) { token = _token; }

    function splitFee(uint256 totalFee, address /*dAppRecipient*/)
        external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare)
    {
        // Pull gUSD from caller
        (bool ok,) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), totalFee)
        );
        require(ok, "fee pull failed");
        ubiShare      = (totalFee * 3333) / 10000;
        protocolShare = (totalFee * 1667) / 10000;
        dAppShare     = totalFee - ubiShare - protocolShare;
        ubiReceived   += ubiShare;
        totalReceived += totalFee;
    }

    function splitFeeToken(uint256 totalFee, address /*dAppRecipient*/, address _token)
        external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare)
    {
        (bool ok,) = _token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), totalFee)
        );
        require(ok, "fee pull failed");
        ubiShare      = (totalFee * 3333) / 10000;
        protocolShare = (totalFee * 1667) / 10000;
        dAppShare     = totalFee - ubiShare - protocolShare;
        ubiReceived   += ubiShare;
        totalReceived += totalFee;
    }
}
