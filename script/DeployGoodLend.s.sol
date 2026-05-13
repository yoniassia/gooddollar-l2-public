// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/lending/GoodLendPool.sol";
import "../src/lending/GoodLendToken.sol";
import "../src/lending/DebtToken.sol";
import "../src/lending/InterestRateModel.sol";
import "../src/lending/SimplePriceOracle.sol";

/**
 * @title DeployGoodLend
 * @notice Deploys the full GoodLend lending protocol on GoodDollar L2 devnet.
 *
 *         Deploys:
 *           1. SimplePriceOracle
 *           2. InterestRateModel
 *           3. GoodLendPool
 *           4. Per reserve: GoodLendToken (gToken) + DebtToken
 *           5. Configures initial markets: MockUSDC, MockWETH, GoodDollar (if available)
 */
contract DeployGoodLend is Script {
    uint256 constant RAY = 1e27;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock tokens for devnet
        MockUSDC usdc = new MockUSDC();
        MockWETH weth = new MockWETH();

        console.log("MockUSDC deployed:", address(usdc));
        console.log("MockWETH deployed:", address(weth));

        // 2. Deploy oracle
        SimplePriceOracle oracle = new SimplePriceOracle(deployer);
        oracle.setAssetPrice(address(usdc), 1e8);        // $1.00
        oracle.setAssetPrice(address(weth), 2000e8);      // $2,000
        console.log("SimplePriceOracle deployed:", address(oracle));

        // 3. Deploy interest rate model
        InterestRateModel rateModel = new InterestRateModel(deployer);

        // USDC: 80% optimal, 0% base, 4% slope1, 60% slope2
        rateModel.setRateParams(address(usdc), 0.80e27, 0, 0.04e27, 0.60e27);

        // WETH: 80% optimal, 1% base, 3.8% slope1, 80% slope2
        rateModel.setRateParams(address(weth), 0.80e27, 0.01e27, 0.038e27, 0.80e27);

        console.log("InterestRateModel deployed:", address(rateModel));

        // 4. Deploy GoodLend Pool
        // Treasury = deployer for now (will be replaced with UBIFeeSplitter)
        GoodLendPool pool = new GoodLendPool(
            address(oracle),
            address(rateModel),
            deployer,  // treasury
            deployer   // admin
        );
        console.log("GoodLendPool deployed:", address(pool));

        // 5. Deploy gTokens and debt tokens for USDC
        GoodLendToken gUSDC = new GoodLendToken(
            address(pool), address(usdc), "GoodLend USDC", "gUSDC"
        );
        DebtToken dUSDC = new DebtToken(
            address(pool), address(usdc), "GoodLend Debt USDC", "dUSDC"
        );
        console.log("gUSDC deployed:", address(gUSDC));
        console.log("dUSDC deployed:", address(dUSDC));

        // 6. Deploy gTokens and debt tokens for WETH
        GoodLendToken gWETH = new GoodLendToken(
            address(pool), address(weth), "GoodLend WETH", "gWETH"
        );
        DebtToken dWETH = new DebtToken(
            address(pool), address(weth), "GoodLend Debt WETH", "dWETH"
        );
        console.log("gWETH deployed:", address(gWETH));
        console.log("dWETH deployed:", address(dWETH));

        // 7. Initialize reserves
        // USDC: 80% LTV, 85% liq threshold, 5% bonus, 20% reserve factor
        pool.initReserve(
            address(usdc), address(gUSDC), address(dUSDC),
            2000,      // 20% reserve factor
            8000,      // 80% LTV
            8500,      // 85% liquidation threshold
            10500,     // 5% liquidation bonus
            1_000_000, // 1M USDC supply cap
            800_000,   // 800K USDC borrow cap
            6          // decimals
        );

        // WETH: 75% LTV, 82% liq threshold, 5% bonus, 20% reserve factor
        pool.initReserve(
            address(weth), address(gWETH), address(dWETH),
            2000,   // 20% reserve factor
            7500,   // 75% LTV
            8200,   // 82% liquidation threshold
            10500,  // 5% liquidation bonus
            500,    // 500 ETH supply cap
            300,    // 300 ETH borrow cap
            18      // decimals
        );

        // 8. Mint seed tokens to deployer for testing
        usdc.mint(deployer, 1_000_000e6);  // 1M USDC
        weth.mint(deployer, 1000e18);       // 1000 WETH

        // 9. Approve gToken contracts to let pool pull funds
        usdc.approve(address(pool), type(uint256).max);
        weth.approve(address(pool), type(uint256).max);

        // 10. Seed initial liquidity
        pool.supply(address(usdc), 100_000e6);  // 100K USDC
        pool.supply(address(weth), 50e18);        // 50 WETH

        console.log("--- GoodLend Deployment Complete ---");
        console.log("Pool:        ", address(pool));
        console.log("Oracle:      ", address(oracle));
        console.log("RateModel:   ", address(rateModel));
        console.log("USDC:        ", address(usdc));
        console.log("WETH:        ", address(weth));
        console.log("gUSDC:       ", address(gUSDC));
        console.log("gWETH:       ", address(gWETH));
        console.log("dUSDC:       ", address(dUSDC));
        console.log("dWETH:       ", address(dWETH));
        console.log("Seed supply: 100K USDC + 50 WETH");

        vm.stopBroadcast();
    }
}

// Simple mock tokens for devnet deployment
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) { require(a >= amount); allowance[from][msg.sender] = a - amount; }
        require(balanceOf[from] >= amount);
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockWETH {
    string public constant name = "Wrapped Ether";
    string public constant symbol = "WETH";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount);
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) { require(a >= amount); allowance[from][msg.sender] = a - amount; }
        require(balanceOf[from] >= amount);
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}
